/**
 * Compose, merge, join, and paginate index queries as Effect streams.
 *
 * A query stream is an Effect `Stream` of decoded documents with stored keys, a
 * shared key layout, and a direction. Create one with
 * `reader.table(...).stream(index, range?, order?)` for a standard index. The
 * order defaults to `"asc"`; search indexes use `reader.table(...).search(...)`
 * instead. Unlike `reader.table(...).index(...).stream()`, this returns a
 * composable query stream rather than a plain `Stream` over one query.
 *
 * Creating or composing a stream does not read documents. Reads begin when you
 * run a consuming effect, such as `Stream.runCollect` or `paginate`, and each
 * run executes the queries again. Keep callbacks deterministic and read-only:
 * pagination, seeks, and reversal can reevaluate them.
 *
 * Key values are stored separately from emitted values. Pinning an index field
 * with `eq` removes it from the key; range bounds keep it. Keys retain creation
 * time and document-ID tiebreakers where applicable. `QueryStream` combinators
 * preserve the ordering information needed to merge and paginate; plain
 * `Stream` transforms return ordinary streams without that information. A key
 * layout describes the key positions, their visible labels, and implicit ID
 * positions. Reuse a stream's `keyLayout` with `empty` or `flatMap`.
 *
 * Return the whole `paginate` result from a paginated query handler. In React,
 * use `useStreamPaginatedQuery`, not `usePaginatedQuery`: stream pages aren't
 * tracked by Convex's query journal, so the stream hook pins and splits page
 * ranges to keep loaded pages gap-free. Foldkit's `PaginatedQuery` also
 * supports stream pagination.
 *
 * Stream querying is experimental on the v10 prerelease line. Its API may
 * change between prereleases.
 */
import type {
  PaginationOptions as ConvexPaginationOptions,
  PaginationResult as ConvexPaginationResult,
} from "convex/server";
import { ConvexError } from "convex/values";
import { identity, dual, pipe } from "effect/Function";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Array from "effect/Array";
import type * as Channel from "effect/Channel";
import * as Chunk from "effect/Chunk";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Filter from "effect/Filter";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import * as Pull from "effect/Pull";
import type * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import * as Result from "effect/Result";
import * as Tuple from "effect/Tuple";
import type * as Types from "effect/Types";
import * as Document from "./Document";
import * as QueryStreamCursor from "./QueryStreamCursor";
import * as QueryStreamKeyLabels from "./QueryStreamKeyLabels";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import * as QueryStreamOrderDirection from "./QueryStreamOrderDirection";
import * as QueryStreamKeyValues from "./QueryStreamKeyValues";
import * as QueryStreamIndexPrefix from "./QueryStreamIndexPrefix";
import * as QueryStreamKey from "./QueryStreamKey";
import * as QueryStreamKeyBounds from "./QueryStreamKeyBounds";
import * as QueryStreamIndexRange from "./QueryStreamIndexRange";
import * as QueryStreamPagination from "./QueryStreamPagination";
import * as QueryStreamReadBudget from "./QueryStreamReadBudget";

/**
 * A page exhausted its read budget without a safe logical continuation.
 *
 * @experimental
 */
export class ReadBudgetExceededError extends Schema.TaggedError<ReadBudgetExceededError>()(
  "ReadBudgetExceededError",
  { rowsRead: Schema.Natural, bytesRead: Schema.Natural },
) {
  override get message() {
    return "The read budget was exhausted before a safe page boundary; increase the budget or simplify the query";
  }
}

/**
 * Thrown by `merge` when inputs have different directions, visible ordering
 * labels, or implicit-ID positions. The payload identifies the expected and
 * actual direction and layout; map and relabel compatible inputs before
 * merging.
 *
 * @experimental
 */
export class IncompatibleStreamsError extends Data.TaggedError(
  "IncompatibleStreamsError",
)<{
  readonly expectedOrderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection;
  readonly actualOrderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection;
  readonly expectedKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly actualKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
}> {
  override get message(): string {
    return `QueryStream.merge: all streams must share an order and key layout (got ${this.expectedOrderDirection} ${QueryStreamKeyLayout.format(this.expectedKeyLayout)} and ${this.actualOrderDirection} ${QueryStreamKeyLayout.format(this.actualKeyLayout)})`;
  }
}

/**
 * A `flatMap` inner stream runs in a different direction from its outer stream.
 * The join dies with this error when it runs; `expectedOrderDirection` is the
 * outer direction and `actualOrderDirection` is the inner direction.
 *
 * @experimental
 */
export class InnerStreamOrderMismatchError extends Data.TaggedError(
  "InnerStreamOrderMismatchError",
)<{
  readonly expectedOrderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection;
  readonly actualOrderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection;
}> {
  override get message(): string {
    return `QueryStream.flatMap: inner stream order (${this.actualOrderDirection}) differs from the outer stream's (${this.expectedOrderDirection})`;
  }
}

/**
 * A `flatMap` inner stream does not match the supplied `innerKeyLayout`,
 * including visible labels and implicit-ID positions. The join dies with this
 * error when it runs; the payload contains the expected and actual layouts.
 *
 * @experimental
 */
export class InnerStreamLayoutMismatchError extends Data.TaggedError(
  "InnerStreamLayoutMismatchError",
)<{
  readonly expectedKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly actualKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
}> {
  override get message(): string {
    return `QueryStream.flatMap: inner stream key layout (${QueryStreamKeyLayout.format(this.actualKeyLayout)}) differs from innerKeyLayout (${QueryStreamKeyLayout.format(this.expectedKeyLayout)})`;
  }
}

/**
 * Thrown by `reverse` when a manually constructed stream has no `reverseWith`
 * recipe. Streams created through the table reader and `QueryStream`
 * combinators support reversal.
 *
 * @experimental
 */
export class MissingReversalRecipeError extends Data.TaggedError(
  "MissingReversalRecipeError",
) {
  override get message(): string {
    return "QueryStream.reverse: this stream cannot be reversed without a reversal recipe";
  }
}

/**
 * `paginate` dies with this error for `numItems: 0` and `cursor: null`, because
 * an empty initial page cannot establish a continuation boundary. Request a
 * positive number of items for the first page.
 *
 * @experimental
 */
export {
  EmptyInitialPageError,
  InvalidPageSizeError,
} from "./QueryStreamPagination";

/**
 * Invalid numeric read limits. @experimental.
 */
export { InvalidReadLimitError } from "./QueryStreamReadBudget";

/**
 * Runtime identifier used to distinguish query streams from plain streams.
 *
 * @experimental
 */
export const TypeId = "~@confect/server/QueryStream";
/**
 * Type of the query stream's runtime identifier.
 *
 * @experimental
 */
export type TypeId = typeof TypeId;

/**
 * A decoded value and its stored key. `doc: None` marks an element that was
 * read but filtered out: it emits no value, but still advances cursors. Mapping
 * a value does not recompute its key.
 *
 * @experimental
 */
export class Element<Doc> extends Data.Class<{
  readonly doc: Option.Option<Doc>;
  readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
}> {}

// -----------------------------------------------------------------------------
// QueryStream
// -----------------------------------------------------------------------------

/**
 * An Effect `Stream` whose stored keys determine its order and pagination
 * boundaries independently of its emitted values.
 *
 * TypeScript normally infers all five parameters from the table's `stream`
 * method and subsequent composition:
 *
 * - `Doc` is the emitted value: a decoded document or a mapped or joined result.
 * - `KeyLabels` is the branded readonly tuple of visible ordering names,
 *   initially the index fields not pinned by `eq`. `flatMap` appends labels and
 *   `renameKey` replaces them. Implicit ID tiebreakers are omitted from labels
 *   but retained in `keyLayout`.
 * - `OrderDirection` is `"asc"` or `"desc"`; the type defaults to their union.
 * - `E` contains typed failures while reading or transforming values. `never`
 *   means no typed failures, not no defects.
 * - `R` contains Effect services required to run the stream. The stream retains
 *   the database access supplied at creation, so it doesn't require providing
 *   `DatabaseReader` again; effectful callbacks can add requirements.
 *
 * Known label or direction mismatches prevent merging at compile time. Runtime
 * checks also compare implicit-ID positions. Reuse a compatible stream's
 * `keyLayout` for `empty` or `flatMap`'s `innerKeyLayout`.
 *
 * Consume with Effect's `Stream.runCollect` or `Stream.runHead`, or use
 * `unique` or `paginate`. A plain `Stream` transform such as `Stream.take`
 * returns an ordinary stream that can be consumed but no longer merged or
 * paginated with this module.
 *
 * @experimental
 */
export class QueryStream<
  out Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels =
    QueryStreamKeyLabels.QueryStreamKeyLabels,
  out OrderDirection extends
    QueryStreamOrderDirection.QueryStreamOrderDirection =
    QueryStreamOrderDirection.QueryStreamOrderDirection,
  out E = never,
  out R = never,
> implements Stream.Stream<Doc, E, R> {
  declare readonly [TypeId]: TypeId;
  declare readonly "~labels": Types.Invariant<KeyLabels>;
  declare readonly "~direction": Types.Covariant<OrderDirection>;

  // The `Stream` protocol (the variance marker, `pipe`, and the `channel`
  // the Stream runtime consumes) is implemented directly: the members are
  // `declare`d with their real types here and wired up on the prototype
  // below, so type-parameter inference over `QueryStream` values stays
  // intact for every `Stream.*` combinator.
  declare readonly [Stream.TypeId]: Stream.VarianceStruct<Doc, E, R>;
  declare readonly pipe: Pipeable["pipe"];
  declare readonly channel: Channel.Channel<
    Array.NonEmptyReadonlyArray<Doc>,
    E,
    void,
    unknown,
    unknown,
    unknown,
    R
  >;

  constructor(
    readonly orderDirection: OrderDirection,
    /**
     * Shared description of the key positions, including visible labels and
     * implicit IDs. Reuse with `empty` or `flatMap`'s `innerKeyLayout`. Reading
     * this property does not read documents. Direction is in `orderDirection`.
     */
    readonly keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
    /**
     * Values paired with stored keys, including filtered markers that advance
     * cursors without emitting a value.
     */
    readonly annotated: Stream.Stream<
      Element<Doc>,
      E,
      R | QueryStreamReadBudget.QueryStreamReadBudget
    >,
    /**
     * Query recipe retained by direct index streams and rebuilt on each run.
     * Includes the effective index bounds. Composed streams instead delegate
     * range changes to their inputs through `narrowWith`.
     */
    readonly reflection?: Reflection,
    /**
     * Rebuilds the stream with validated key bounds, pushing them into index
     * ranges where that preserves the composition's results. Without this
     * recipe, `narrow` filters the annotated stream in memory. The constructor
     * guards recipe calls against bounds from incompatible layouts.
     */
    readonly narrowWith?: (
      parsedBounds: QueryStreamKeyBounds.ParsedBounds,
    ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    /**
     * Rebuilds the stream in the opposite direction using index scans and
     * seeks. Distinct streams keep their original representatives. Without this
     * recipe, `reverse` throws `MissingReversalRecipeError`.
     */
    readonly reverseWith?: () => QueryStream<
      Doc,
      KeyLabels,
      QueryStreamOrderDirection.Flip<OrderDirection>,
      E,
      R
    >,
  ) {
    if (narrowWith !== undefined) {
      this.narrowWith = (parsedBounds) =>
        narrowWith(
          Result.getOrThrowWith(
            QueryStreamKeyBounds.forLayout(keyLayout, parsedBounds),
            identity,
          ),
        );
    }
  }

  toStream(): Stream.Stream<Doc, E, R> {
    return Stream.unwrap(
      Effect.gen({ self: this }, function* () {
        const readBudget = yield* Effect.serviceOption(
          QueryStreamReadBudget.QueryStreamReadBudget,
        ).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                QueryStreamReadBudget.make({
                  maximumRowsRead: Option.none(),
                  maximumBytesRead: Option.none(),
                }),
              onSome: Effect.succeed,
            }),
          ),
        );
        return Stream.filterMap(
          this.annotated,
          Filter.fromPredicateOption(({ doc }) => doc),
        ).pipe(
          Stream.provideService(
            QueryStreamReadBudget.QueryStreamReadBudget,
            readBudget,
          ),
        );
      }),
    );
  }
}

const streamVariance = {
  _R: identity,
  _E: identity,
  _A: identity,
};

// Runtime wiring for the `declare`d members above. This is deliberately
// non-FP: implementing the `Streamable` protocol requires prototype-level
// JS (an `arguments`-based `pipe`, an internal `channel` getter the Stream
// runtime unwraps). (`prototype` is widened so the Effect language service
// doesn't flag the `defineProperties` return value—an Effect-able—as
// floating.)
const queryStreamPrototype: object = QueryStream.prototype;

Object.defineProperties(queryStreamPrototype, {
  [TypeId]: { value: TypeId },
  [Stream.TypeId]: { value: streamVariance },
  pipe: {
    value: function (this: unknown) {
      return pipeArguments(this, arguments);
    },
  },
  channel: {
    get(this: QueryStream<unknown>) {
      return Stream.toChannel(this.toStream());
    },
  },
});

/**
 * A query stream with any value, ordering, error, and requirement types.
 *
 * @experimental
 */
export type Any = QueryStream<any, any, any, any, any>;

/**
 * Check whether a value retains query-stream ordering and pagination support.
 * Plain `Stream` transforms return ordinary streams, for which this is false.
 *
 * @experimental
 */
export const isQueryStream = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * Create a stream with no documents but a known key layout and direction. Use
 * it when a dynamic list of streams is empty, since `merge` requires at least
 * one input. The direction defaults to `"asc"`.
 *
 * Supply the document type in the first call, then reuse a compatible stream's
 * layout: `QueryStream.empty<NotesDoc>()(source.keyLayout, "desc")`. Creating
 * the source solely to obtain its layout does not read documents.
 *
 * @experimental
 */
export const empty =
  <Doc>(): {
    <const KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels>(
      keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
    ): QueryStream<Doc, KeyLabels, "asc", never, never>;
    <
      const KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
      OrderDirection extends
        QueryStreamOrderDirection.QueryStreamOrderDirection,
    >(
      keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
      orderDirection: OrderDirection,
    ): QueryStream<Doc, KeyLabels, OrderDirection, never, never>;
  } =>
  <KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels>(
    keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
    orderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection = "asc",
  ) => {
    // The overloads preserve the supplied direction or its ascending default.
    const make = (
      currentOrderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection,
    ): QueryStream<Doc, KeyLabels, any, never, never> =>
      new QueryStream(
        currentOrderDirection,
        keyLayout,
        Stream.empty,
        undefined,
        // Narrowing nothing is nothing, and so is reversing it.
        () => make(currentOrderDirection),
        () => make(QueryStreamOrderDirection.flip(currentOrderDirection)),
      );
    return make(orderDirection);
  };

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/**
 * Database access needed to rebuild a direct index query on each run. Normally
 * supplied by `reader.table(...).stream(...)` rather than implemented
 * manually.
 *
 * @experimental
 */
export interface ReflectionReader {
  query(tableName: string): {
    withIndex(
      indexName: string,
      indexRange?: (q: any) => any,
    ): {
      order(
        orderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection,
      ): AsyncIterable<unknown>;
    };
  };
}

/**
 * A reusable index-query description: database access, table schema, index,
 * range, and direction. Direct index streams retain this description instead of
 * a one-shot Convex query so each run can execute the query again. Narrowing
 * and pagination use it to rebuild queries with tighter index bounds.
 *
 * @experimental
 */
export interface Reflection<
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection =
    QueryStreamOrderDirection.QueryStreamOrderDirection,
> {
  readonly reader: ReflectionReader;
  readonly tableName: string;
  readonly tableSchema: Schema.Codec<any, any>;
  readonly indexName: string;
  /**
   * Index fields in declared order, including `_creationTime` where applicable.
   * The `by_id` index uses only `["_id"]`.
   */
  readonly indexFieldPaths: ReadonlyArray<string>;
  /**
   * Index constraints. Equality constraints pin leading fields, removing them
   * from the stream's key; range bounds do not.
   */
  readonly indexRange: QueryStreamIndexRange.QueryStreamIndexRange;
  readonly orderDirection: OrderDirection;
  /**
   * Effective bounds in full index-key values, including pinned fields and ID
   * tiebreakers. If absent, bounds come from `indexRange`; supplied bounds
   * intersect those constraints rather than replacing them.
   */
  readonly indexBounds?: QueryStreamKeyBounds.IndexBounds;
}

/**
 * Create a reusable query stream from an index-query description. Prefer
 * `reader.table(...).stream(...)` for inferred document and ordering types.
 *
 * Construction does not read documents. Each consuming run rebuilds the index
 * queries within the supplied range and decodes their documents, failing with
 * `DocumentDecodeError` if decoding fails. Key values come from encoded index
 * values before decoding, with equality-pinned fields removed.
 *
 * @experimental
 */
export const fromReflection = <
  Doc,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection =
    QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  reflection: Reflection<OrderDirection>,
): QueryStream<
  Doc,
  QueryStreamKeyLabels.QueryStreamKeyLabels,
  OrderDirection,
  Document.DocumentDecodeError,
  never
> =>
  makeLeaf(
    reflection,
    reflection.indexBounds === undefined
      ? QueryStreamIndexRange.toBounds(reflection.indexRange)
      : QueryStreamKeyBounds.intersectIndexBounds(
          QueryStreamIndexRange.toBounds(reflection.indexRange),
          reflection.indexBounds,
        ),
  );

/**
 * Complete the source index paths with Convex's implicit ID tiebreaker. These
 * paths address the encoded document and are never ordering aliases.
 */
const completeFieldPaths = (
  fieldPaths: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Option.exists(Array.last(fieldPaths), (fieldPath) => fieldPath === "_id")
    ? fieldPaths
    : Array.append(fieldPaths, "_id");

const makeLeaf = <
  Doc,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  reflection: Reflection<OrderDirection>,
  indexBounds: QueryStreamKeyBounds.IndexBounds,
): QueryStream<
  Doc,
  QueryStreamKeyLabels.QueryStreamKeyLabels,
  OrderDirection,
  Document.DocumentDecodeError,
  never
> => {
  // Bounds and range splitting work in full index-key space: the index's
  // fields plus the implicit `_id` tiebreaker (already explicit for
  // `by_id`). Convex accepts range constraints on `_creationTime` and
  // `_id` even though its index types don't advertise them.
  const fullFieldPaths = completeFieldPaths(reflection.indexFieldPaths);
  const equalityPrefixLength = QueryStreamIndexRange.equalityPrefixLength(
    reflection.indexRange,
  );
  const keyLayout = Result.getOrThrowWith(
    QueryStreamKeyLayout.fromIndex(
      reflection.indexFieldPaths,
      equalityPrefixLength,
    ),
    identity,
  );
  const keyPaths = Array.map(
    Array.drop(fullFieldPaths, equalityPrefixLength),
    (fieldPath) => String.split(fieldPath, "."),
  );
  // `eq`-pinned values form a shared prefix of both bound keys.
  const equalityKeyValues = Array.take(
    indexBounds.lower.keyValues,
    equalityPrefixLength,
  );
  const indexRanges = Result.getOrThrowWith(
    QueryStreamIndexRange.fromBounds(
      fullFieldPaths,
      reflection.orderDirection,
      indexBounds,
    ),
    identity,
  );

  const encodedDocuments = Stream.fromIterable(indexRanges).pipe(
    Stream.flatMap((indexRange) =>
      Stream.suspend(() =>
        Stream.fromAsyncIterable(
          reflection.reader
            .query(reflection.tableName)
            .withIndex(reflection.indexName, (q) =>
              QueryStreamIndexRange.apply(indexRange, q),
            )
            .order(reflection.orderDirection),
          identity,
        ).pipe(Stream.orDie),
      ),
    ),
  );

  const budgetedDocuments = Stream.unwrap(
    Effect.map(QueryStreamReadBudget.QueryStreamReadBudget, (readBudget) =>
      readBudget.accountFor(encodedDocuments),
    ),
  );

  const annotated = budgetedDocuments.pipe(
    Stream.mapEffect((encoded) =>
      Effect.map(
        Document.decode(reflection.tableName, reflection.tableSchema)(encoded),
        (doc) =>
          new Element({
            doc: Option.some(doc as Doc),
            keyValues: QueryStreamKeyValues.extract(
              encoded as Record.ReadonlyRecord<string, unknown>,
              keyPaths,
            ),
          }),
      ),
    ),
  );

  const toFullKeySpace = (
    bound: QueryStreamKeyBounds.ParsedBound,
  ): QueryStreamKeyBounds.KeyBound => ({
    keyValues: QueryStreamIndexPrefix.keyValues(
      Result.getOrThrowWith(
        QueryStreamIndexPrefix.fromStreamKey(
          fullFieldPaths,
          equalityKeyValues,
          bound.key,
        ),
        identity,
      ),
    ),
    inclusive: bound.inclusive,
  });

  return new QueryStream(
    reflection.orderDirection,
    keyLayout,
    annotated,
    { ...reflection, indexBounds },
    (parsedBounds) =>
      makeLeaf(reflection, {
        lower: Option.match(parsedBounds.lower, {
          onNone: () => indexBounds.lower,
          onSome: (bound) =>
            QueryStreamKeyBounds.tightestLower(
              indexBounds.lower,
              toFullKeySpace(bound),
            ),
        }),
        upper: Option.match(parsedBounds.upper, {
          onNone: () => indexBounds.upper,
          onSome: (bound) =>
            QueryStreamKeyBounds.tightestUpper(
              indexBounds.upper,
              toFullKeySpace(bound),
            ),
        }),
      }),
    // Bounds live in ascending key space, so the reversed leaf keeps them.
    () =>
      makeLeaf(
        {
          ...reflection,
          orderDirection: QueryStreamOrderDirection.flip(
            reflection.orderDirection,
          ),
        },
        indexBounds,
      ),
  );
};

// -----------------------------------------------------------------------------
// Combinators
// -----------------------------------------------------------------------------

type MergeSource<Doc, E> = Data.TaggedEnum<{
  NeedsPull: {
    readonly pull: Pull.Pull<Array.NonEmptyReadonlyArray<Element<Doc>>, E>;
  };
  Buffered: {
    readonly pull: Pull.Pull<Array.NonEmptyReadonlyArray<Element<Doc>>, E>;
    readonly head: Element<Doc>;
    readonly tail: Chunk.Chunk<Element<Doc>>;
  };
  Exhausted: {};
  BudgetLimited: {};
}>;

interface MergeSourceDefinition extends Data.TaggedEnum.WithGenerics<2> {
  readonly taggedEnum: MergeSource<this["A"], this["B"]>;
}

const MergeSource = Data.taggedEnum<MergeSourceDefinition>();

class MergeCandidate<Doc> extends Data.Class<{
  readonly index: number;
  readonly element: Element<Doc>;
}> {}

const fillMergeSource = <Doc, E>(
  source: MergeSource<Doc, E>,
): Effect.Effect<
  MergeSource<Doc, E>,
  E,
  QueryStreamReadBudget.QueryStreamReadBudget
> =>
  MergeSource.$match(source, {
    NeedsPull: ({ pull }) =>
      pull.pipe(
        Effect.map((elements) =>
          MergeSource.Buffered({
            pull,
            head: Array.headNonEmpty(elements),
            tail: Chunk.fromIterable(Array.tailNonEmpty(elements)),
          }),
        ),
        Pull.catchDone(() =>
          Effect.gen(function* () {
            const readBudget =
              yield* QueryStreamReadBudget.QueryStreamReadBudget;
            return (yield* readBudget.isStopped)
              ? MergeSource.BudgetLimited()
              : MergeSource.Exhausted();
          }),
        ),
      ),
    Buffered: () => Effect.succeed(source),
    Exhausted: () => Effect.succeed(source),
    BudgetLimited: () => Effect.succeed(source),
  });

/**
 * One step of the k-way merge as a pure unfold: fill every source, emit the
 * earliest head (ties go to the earliest source, keeping the merge stable), and
 * return the sources with that head consumed. `undefined` when every source is
 * exhausted or an input stopped before its next key was known.
 */
const mergeStep =
  <Doc, E>(keyOrder: Order.Order<QueryStreamKeyValues.QueryStreamKeyValues>) =>
  (
    sources: ReadonlyArray<MergeSource<Doc, E>>,
  ): Effect.Effect<
    readonly [Element<Doc>, ReadonlyArray<MergeSource<Doc, E>>] | undefined,
    E,
    QueryStreamReadBudget.QueryStreamReadBudget
  > =>
    Effect.gen(function* () {
      const readBudget = yield* QueryStreamReadBudget.QueryStreamReadBudget;
      const filled = yield* Effect.forEach(sources, fillMergeSource, {
        concurrency: (yield* readBudget.isUnlimited) ? "unbounded" : 1,
      });
      if (filled.some((source) => MergeSource.$is("BudgetLimited")(source)))
        return undefined;
      const isEarlier = Order.isLessThan(keyOrder);

      const earliest = Array.reduce(
        filled,
        Option.none<MergeCandidate<Doc>>(),
        (best, source, index) =>
          Option.match(
            source._tag === "Buffered"
              ? Option.some(source.head)
              : Option.none<Element<Doc>>(),
            {
              onNone: () => best,
              onSome: (head) =>
                Option.match(best, {
                  onNone: () =>
                    Option.some(new MergeCandidate({ index, element: head })),
                  onSome: ({ element: bestElement }) =>
                    isEarlier(head.keyValues, bestElement.keyValues)
                      ? Option.some(
                          new MergeCandidate({ index, element: head }),
                        )
                      : best,
                }),
            },
          ),
      );

      return Option.getOrUndefined(
        Option.map(earliest, ({ index, element }) =>
          Tuple.make(
            element,
            Array.map(filled, (source, sourceIndex) =>
              sourceIndex === index && source._tag === "Buffered"
                ? Option.match(Chunk.head(source.tail), {
                    onNone: () => MergeSource.NeedsPull({ pull: source.pull }),
                    onSome: (head) =>
                      MergeSource.Buffered({
                        pull: source.pull,
                        head,
                        tail: Chunk.drop(source.tail, 1),
                      }),
                  })
                : source,
            ),
          ),
        ),
      );
    });

/**
 * Combine streams sharing a key layout into one stream in key order. Use this
 * to query several index ranges at once, such as notes by multiple roles.
 *
 * The merge emits the smallest next key when ascending and the largest when
 * descending. Unlike `Stream.merge`, it does not interleave by arrival time.
 * Overlapping inputs are not deduplicated: a document matched twice appears
 * twice. Supply at least one input; use `empty` for an empty dynamic list.
 *
 * Inputs need compatible document types and identical key layouts and
 * directions. TypeScript rejects known mismatches; runtime mismatches throw
 * `IncompatibleStreamsError` when combined. Map to a common value shape and use
 * `renameKey` when compatible indexes have different field names.
 *
 * @experimental
 */
export const merge = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    ...ReadonlyArray<
      QueryStream<Doc, KeyLabels, NoInfer<OrderDirection>, E, R>
    >,
  ],
): QueryStream<Doc, KeyLabels, OrderDirection, E, R> => {
  const head = Array.headNonEmpty(streams);
  const incompatible = Array.findFirst(
    Array.tailNonEmpty(streams),
    (stream) =>
      stream.orderDirection !== head.orderDirection ||
      !QueryStreamKeyLayout.Equivalence(stream.keyLayout, head.keyLayout),
  );
  if (Option.isSome(incompatible)) {
    throw new IncompatibleStreamsError({
      expectedOrderDirection: head.orderDirection,
      actualOrderDirection: incompatible.value.orderDirection,
      expectedKeyLayout: head.keyLayout,
      actualKeyLayout: incompatible.value.keyLayout,
    });
  }
  return mergeUnchecked(streams);
};

/**
 * `merge` without the compatibility check—for re-merging branches that were
 * validated when the merge was built (narrowing never changes a branch's order
 * or key layout).
 */
const mergeUnchecked = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    ...ReadonlyArray<QueryStream<Doc, KeyLabels, OrderDirection, E, R>>,
  ],
): QueryStream<Doc, KeyLabels, OrderDirection, E, R> => {
  const head = Array.headNonEmpty(streams);
  const annotated: Stream.Stream<
    Element<Doc>,
    E,
    R | QueryStreamReadBudget.QueryStreamReadBudget
  > = Stream.unwrap(
    Effect.map(
      Effect.forEach(streams, (stream) => Stream.toPull(stream.annotated)),
      (pulls) =>
        Stream.unfold(
          Array.map(pulls, (pull) => MergeSource.NeedsPull({ pull })),
          mergeStep<Doc, E>(QueryStreamKeyValues.Order(head.orderDirection)),
        ),
    ),
  );

  return new QueryStream(
    head.orderDirection,
    head.keyLayout,
    annotated,
    undefined,
    // Narrowing a merge narrows every branch; the bounds are in the shared
    // key space, so each branch converts them to its own index-key
    // space itself.
    (parsedBounds) =>
      mergeUnchecked([
        narrowByParsedBounds(head, parsedBounds),
        ...Array.map(Array.tailNonEmpty(streams), (stream) =>
          narrowByParsedBounds(stream, parsedBounds),
        ),
      ]),
    () =>
      mergeUnchecked([
        reverse(head),
        ...Array.map(Array.tailNonEmpty(streams), (stream) => reverse(stream)),
      ]),
  );
};

/**
 * Derive a stream by transforming each present document into `Some` (keep,
 * possibly changed) or `None` (drop). Key values are preserved and dropped
 * elements stay in cursor accounting as read-but-filtered, so the result
 * remains mergeable and paginable; narrowing narrows the input and re-applies
 * the transform, so cursor bounds keep pushing down to leaves.
 */
const transform = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  Doc2,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  f: (doc: Doc) => Option.Option<Doc2>,
): QueryStream<Doc2, KeyLabels, OrderDirection, E, R> =>
  new QueryStream(
    self.orderDirection,
    self.keyLayout,
    Stream.map(
      self.annotated,
      ({ doc, keyValues }) =>
        new Element({ doc: Option.flatMap(doc, f), keyValues }),
    ),
    undefined,
    (parsedBounds) => transform(narrowByParsedBounds(self, parsedBounds), f),
    () => transform(reverse(self), f),
  );

/**
 * The effectful {@link transform}.
 */
const transformEffect = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  Doc2,
  E2,
  R2,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  f: (doc: Doc) => Effect.Effect<Option.Option<Doc2>, E2, R2>,
  options: EffectOptions | undefined,
): QueryStream<Doc2, KeyLabels, OrderDirection, E | E2, R | R2> =>
  new QueryStream(
    self.orderDirection,
    self.keyLayout,
    Stream.mapEffect(
      self.annotated,
      ({ doc, keyValues }) =>
        Option.match(doc, {
          onNone: () =>
            Effect.succeed(
              new Element({ doc: Option.none<Doc2>(), keyValues }),
            ),
          onSome: (value) =>
            Effect.map(
              f(value),
              (mapped) => new Element({ doc: mapped, keyValues }),
            ),
        }),
      // Order is preserved at any concurrency: elements are emitted in
      // input order however their effects finish.
      { concurrency: options?.concurrency },
    ),
    undefined,
    (parsedBounds) =>
      transformEffect(narrowByParsedBounds(self, parsedBounds), f, options),
    () => transformEffect(reverse(self), f, options),
  );

/**
 * Control concurrent callback evaluation in `filterEffect` and `mapEffect`.
 *
 * @experimental
 */
export interface EffectOptions {
  /**
   * Maximum number of document effects running at once, or `"unbounded"`.
   * Defaults to one at a time. Results retain stream order regardless of
   * completion order; callbacks must remain deterministic and read-only.
   */
  readonly concurrency?: number | "unbounded" | undefined;
}

/**
 * Keep values that satisfy a pure predicate without changing their stored keys.
 * Like `Stream.filter`, this removes emitted values, but it retains the
 * ordering information needed to merge and paginate the result.
 *
 * Rejected documents still count as reads and advance cursors. Filtering before
 * `distinct` selects each group's first matching document; filtering after it
 * tests only the chosen representative. Use `filterEffect` for predicates that
 * read another table, use a service, or fail with a typed error.
 *
 * @experimental
 */
export const filter = dual<
  <Doc>(
    predicate: (doc: Doc) => boolean,
  ) => <
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    predicate: (doc: Doc) => boolean,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>
>(2, (self, predicate) =>
  transform(self, (doc) => (predicate(doc) ? Option.some(doc) : Option.none())),
);

/**
 * Keep values that satisfy an effectful predicate, preserving stored keys and
 * cursor progress just like `filter`. The predicate can read other tables or
 * use services; its errors and requirements become part of the stream's types.
 *
 * Effects run one document at a time by default. Pass `{ concurrency }` to run
 * several at once while retaining stream order. Keep the predicate
 * deterministic and read-only, since seeks and pagination can run it again.
 * Separate lookups inside the predicate are not counted by pagination's read
 * budgets.
 *
 * @experimental
 */
export const filterEffect = dual<
  <Doc, E2, R2>(
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
    options?: EffectOptions,
  ) => <
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E | E2, R | R2>,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    E2,
    R2,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E | E2, R | R2>
>(
  (args) => isQueryStream(args[0]),
  (self, predicate, options) =>
    transformEffect(
      self,
      (doc) =>
        Effect.map(predicate(doc), (keep) =>
          keep ? Option.some(doc) : Option.none(),
        ),
      options,
    ),
);

/**
 * Transform emitted values with a pure function while keeping their stored key
 * values. The result retains merge and pagination support, unlike the plain
 * stream returned by `Stream.map`.
 *
 * The mapper may replace any fields, including indexed fields, or return a
 * different shape entirely. It does not recompute keys or sort by the new
 * values: mapping note text to its length still orders by the original text,
 * creation time, and ID, not by length. Preserve the input value rather than
 * mutating it. Use `mapEffect` when the mapper needs an effect.
 *
 * @experimental
 */
export const map = dual<
  <Doc, Doc2>(
    f: (doc: Doc) => Doc2,
  ) => <
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<Doc2, KeyLabels, OrderDirection, E, R>,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    Doc2,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    f: (doc: Doc) => Doc2,
  ) => QueryStream<Doc2, KeyLabels, OrderDirection, E, R>
>(2, (self, f) => transform(self, (doc) => Option.some(f(doc))));

/**
 * Transform emitted values with an effect, preserving the original stored keys
 * just like `map`. The mapper may read another table or use services; its
 * errors and requirements become part of the stream's types.
 *
 * Effects run one document at a time by default. Pass `{ concurrency }` for
 * concurrent reads without changing output order. Keep the mapper deterministic
 * and read-only: seeks, reversal, and pagination can reevaluate it. Separate
 * lookups inside the mapper are not counted by pagination's read budgets.
 *
 * @experimental
 */
export const mapEffect = dual<
  <Doc, Doc2, E2, R2>(
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
    options?: EffectOptions,
  ) => <
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<Doc2, KeyLabels, OrderDirection, E | E2, R | R2>,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    Doc2,
    E2,
    R2,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc2, KeyLabels, OrderDirection, E | E2, R | R2>
>(
  (args) => isQueryStream(args[0]),
  (self, f, options) =>
    transformEffect(self, (doc) => Effect.asSome(f(doc)), options),
);

/**
 * Run an inner query stream for each outer document and concatenate the
 * results. Like sequential `Stream.flatMap`, each inner stream finishes before
 * the next begins. The joined key is the outer key followed by the inner key,
 * retaining both document IDs so equal timestamps remain distinguishable.
 *
 * Supply `options.innerKeyLayout` from a compatible stream's `keyLayout`. For
 * example, comments indexed by `noteId` and pinned to a note have the same
 * layout as comments ordered by creation time: one visible creation-time
 * position followed by an implicit ID. Creating the template reads no
 * documents. For nested joins or renamed streams, apply the same composition or
 * renaming to the template before reusing its layout.
 *
 * The layout is required when constructing the joined stream, before any outer
 * document is available to pass to `f`, including when the outer stream is
 * empty. It determines the joined key positions and the width of empty-inner
 * markers. It contains no query results or direction.
 *
 * Every inner stream must match that layout and the outer direction. TypeScript
 * rejects known mismatches; others die with `InnerStreamOrderMismatchError` or
 * `InnerStreamLayoutMismatchError` when the join runs.
 *
 * An empty inner stream emits no value by default, but leaves a filtered marker
 * that advances cursors past its outer document. Pass `options.onEmpty` to emit
 * `onEmpty(outer)` instead. The element type widens to include the placeholder,
 * so map inner values to a common shape when needed. Its key is the outer key
 * followed by null inner components, and pagination steps past it like any
 * element. Outer documents filtered out before the join remain absent.
 *
 * Keep `f` and `onEmpty` deterministic and read-only. Pagination, narrowing,
 * and reversal can reevaluate them; both outer and inner index reads count
 * toward pagination's budgets.
 *
 * @experimental
 */
export const flatMap = dual<
  <
    Doc,
    Doc2,
    InnerKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E2,
    R2,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
    Doc3 = never,
  >(
    f: (doc: Doc) => QueryStream<Doc2, InnerKeyLabels, OrderDirection, E2, R2>,
    options: {
      readonly innerKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<
        NoInfer<InnerKeyLabels>
      >;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => <KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels, E, R>(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<
    Doc2 | Doc3,
    QueryStreamKeyLabels.Concat<KeyLabels, InnerKeyLabels>,
    OrderDirection,
    E | E2,
    R | R2
  >,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    Doc2,
    InnerKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E2,
    R2,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
    Doc3 = never,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    f: (
      doc: Doc,
    ) => QueryStream<Doc2, InnerKeyLabels, NoInfer<OrderDirection>, E2, R2>,
    options: {
      readonly innerKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<
        NoInfer<InnerKeyLabels>
      >;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => QueryStream<
    Doc2 | Doc3,
    QueryStreamKeyLabels.Concat<KeyLabels, InnerKeyLabels>,
    OrderDirection,
    E | E2,
    R | R2
  >
>(3, (self, f, options): Any => {
  return makeFlatMap(
    self,
    f,
    options.innerKeyLayout,
    Option.fromUndefinedOr(options.onEmpty),
    { lower: Option.none(), upper: Option.none() },
  );
});

/**
 * Inner bounds that apply only to the outer row whose key values are
 * `outerKeyValues`.
 */
interface InnerRefinement {
  readonly outerKeyValues: QueryStreamKeyValues.QueryStreamKeyValues;
  readonly innerParsedBound: QueryStreamKeyBounds.ParsedBound;
}

interface InnerRefinements {
  readonly lower: Option.Option<InnerRefinement>;
  readonly upper: Option.Option<InnerRefinement>;
}

type FlatMapBound = Data.TaggedEnum<{
  Outer: QueryStreamKeyBounds.KeyBound;
  Inner: InnerRefinement;
}>;

const FlatMapBound = Data.taggedEnum<FlatMapBound>();

const combineLowerRefinements = (
  existing: Option.Option<InnerRefinement>,
  incoming: Option.Option<InnerRefinement>,
): Option.Option<InnerRefinement> =>
  Option.orElse(
    Option.zipWith(existing, incoming, (left, right) => {
      const ordering = QueryStreamKeyValues.Order("asc")(
        left.outerKeyValues,
        right.outerKeyValues,
      );
      return ordering > 0
        ? left
        : ordering < 0
          ? right
          : {
              outerKeyValues: left.outerKeyValues,
              innerParsedBound: Result.getOrThrowWith(
                QueryStreamKeyBounds.tightestParsedLower(
                  left.innerParsedBound,
                  right.innerParsedBound,
                ),
                identity,
              ),
            };
    }),
    () => Option.orElse(existing, () => incoming),
  );

const combineUpperRefinements = (
  existing: Option.Option<InnerRefinement>,
  incoming: Option.Option<InnerRefinement>,
): Option.Option<InnerRefinement> =>
  Option.orElse(
    Option.zipWith(existing, incoming, (left, right) => {
      const ordering = QueryStreamKeyValues.Order("asc")(
        left.outerKeyValues,
        right.outerKeyValues,
      );
      return ordering < 0
        ? left
        : ordering > 0
          ? right
          : {
              outerKeyValues: left.outerKeyValues,
              innerParsedBound: Result.getOrThrowWith(
                QueryStreamKeyBounds.tightestParsedUpper(
                  left.innerParsedBound,
                  right.innerParsedBound,
                ),
                identity,
              ),
            };
    }),
    () => Option.orElse(existing, () => incoming),
  );

const makeFlatMap = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  Doc2,
  InnerKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E2,
  R2,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  Doc3 = never,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  f: (doc: Doc) => QueryStream<Doc2, InnerKeyLabels, OrderDirection, E2, R2>,
  innerKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<InnerKeyLabels>,
  /**
   * What an outer document with no inner rows emits, if it is kept.
   */
  onEmpty: Option.Option<(doc: Doc) => Doc3>,
  refinements: InnerRefinements,
): QueryStream<
  Doc2 | Doc3,
  QueryStreamKeyLabels.Concat<KeyLabels, InnerKeyLabels>,
  OrderDirection,
  E | E2,
  R | R2
> => {
  const outerLength = QueryStreamKeyLayout.runtimeWidth(self.keyLayout);
  const keyLayout = QueryStreamKeyLayout.concat(self.keyLayout, innerKeyLayout);
  // The inner key of an outer document that contributes no inner elements
  // (filtered out, or an empty inner stream).
  const emptyInnerKeyValues: QueryStreamKeyValues.QueryStreamKeyValues =
    Array.makeBy(QueryStreamKeyLayout.runtimeWidth(innerKeyLayout), () => null);

  // Visible label types omit implicit IDs, and directions may be unions.
  // Validate every returned stream, including later rows and later runs.
  const validated = (
    inner: QueryStream<Doc2, InnerKeyLabels, OrderDirection, E2, R2>,
  ): QueryStream<Doc2, InnerKeyLabels, OrderDirection, E2, R2> => {
    if (inner.orderDirection !== self.orderDirection) {
      throw new InnerStreamOrderMismatchError({
        expectedOrderDirection: self.orderDirection,
        actualOrderDirection: inner.orderDirection,
      });
    }
    if (!QueryStreamKeyLayout.Equivalence(inner.keyLayout, innerKeyLayout)) {
      throw new InnerStreamLayoutMismatchError({
        expectedKeyLayout: innerKeyLayout,
        actualKeyLayout: inner.keyLayout,
      });
    }
    return inner;
  };

  const innerParsedBoundsFor = (
    outerKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
  ): QueryStreamKeyBounds.ParsedBounds =>
    Result.getOrThrowWith(
      QueryStreamKeyBounds.fromParsed(innerKeyLayout, {
        lower: Option.map(
          Option.filter(
            refinements.lower,
            (refinement) =>
              QueryStreamKeyValues.Order("asc")(
                outerKeyValues,
                refinement.outerKeyValues,
              ) === 0,
          ),
          (refinement) => refinement.innerParsedBound,
        ),
        upper: Option.map(
          Option.filter(
            refinements.upper,
            (refinement) =>
              QueryStreamKeyValues.Order("asc")(
                outerKeyValues,
                refinement.outerKeyValues,
              ) === 0,
          ),
          (refinement) => refinement.innerParsedBound,
        ),
      }),
      identity,
    );

  // The single element an outer document contributes when it has no inner
  // elements: filtered (cursor accounting only), or—for a left join—the
  // `onEmpty` placeholder. Either sits at the outer key followed by `null`s,
  // and is emitted only if that position is within the inner bounds.
  const markerStream = (
    outerKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
    innerParsedBounds: QueryStreamKeyBounds.ParsedBounds,
    doc: Option.Option<Doc2 | Doc3>,
  ): Stream.Stream<Element<Doc2 | Doc3>> => {
    const { aboveLower, belowUpper } = keyPredicates(innerParsedBounds);
    return aboveLower(emptyInnerKeyValues) && belowUpper(emptyInnerKeyValues)
      ? Stream.succeed(
          new Element({
            doc,
            keyValues: Array.appendAll(outerKeyValues, emptyInnerKeyValues),
          }),
        )
      : Stream.empty;
  };

  const annotated: Stream.Stream<
    Element<Doc2 | Doc3>,
    E | E2,
    R | R2 | QueryStreamReadBudget.QueryStreamReadBudget
  > = self.annotated.pipe(
    Stream.flatMap(({ doc: outerDoc, keyValues: outerKeyValues }) => {
      const innerParsedBounds = innerParsedBoundsFor(outerKeyValues);
      return Option.match(outerDoc, {
        onNone: () =>
          markerStream(outerKeyValues, innerParsedBounds, Option.none()),
        onSome: (doc) => {
          const inner = validated(f(doc));
          return narrowByParsedBounds(inner, innerParsedBounds).annotated.pipe(
            Stream.map(
              ({ doc: innerDoc, keyValues: innerKeyValues }) =>
                new Element({
                  doc: innerDoc,
                  keyValues: Array.appendAll(outerKeyValues, innerKeyValues),
                }),
            ),
            Stream.orElseIfEmpty(() =>
              Stream.unwrap(
                Effect.gen(function* () {
                  const readBudget =
                    yield* QueryStreamReadBudget.QueryStreamReadBudget;
                  if (yield* readBudget.isStopped) return Stream.empty;
                  const original = yield* Option.match(
                    Option.gen(function* () {
                      yield* onEmpty;
                      return yield* Option.orElse(
                        innerParsedBounds.lower,
                        () => innerParsedBounds.upper,
                      );
                    }),
                    {
                      onNone: () =>
                        Effect.succeed(Option.none<Element<Doc2>>()),
                      onSome: () => Stream.runHead(inner.annotated),
                    },
                  );
                  const isStopped = yield* readBudget.isStopped;
                  return Option.match(original, {
                    onSome: () => Stream.empty,
                    onNone: () =>
                      isStopped
                        ? Stream.empty
                        : markerStream(
                            outerKeyValues,
                            innerParsedBounds,
                            Option.map(onEmpty, (makeEmpty) => makeEmpty(doc)),
                          ),
                  });
                }),
              ),
            ),
          );
        },
      });
    }),
  );

  const split = (bound: QueryStreamKeyBounds.ParsedBound): FlatMapBound => {
    const keyValues = QueryStreamKey.keyValues(bound.key);
    const { inclusive } = bound;
    return keyValues.length <= outerLength
      ? FlatMapBound.Outer({ keyValues, inclusive })
      : FlatMapBound.Inner({
          outerKeyValues: Array.take(keyValues, outerLength),
          innerParsedBound: Result.getOrThrowWith(
            QueryStreamKeyBounds.parseBound(innerKeyLayout, {
              keyValues: Array.drop(keyValues, outerLength),
              inclusive,
            }),
            identity,
          ),
        });
  };

  const outerBound = (bound: FlatMapBound): QueryStreamKeyBounds.KeyBound =>
    FlatMapBound.$match(bound, {
      Outer: ({ keyValues, inclusive }) => ({ keyValues, inclusive }),
      Inner: ({ outerKeyValues }) => ({
        keyValues: outerKeyValues,
        inclusive: true,
      }),
    });

  return new QueryStream(
    self.orderDirection,
    keyLayout,
    annotated,
    undefined,
    (parsedBounds) => {
      const lower = Option.map(parsedBounds.lower, split);
      const upper = Option.map(parsedBounds.upper, split);
      return makeFlatMap(
        narrowByKeyBounds(self, {
          lower: Option.map(lower, outerBound),
          upper: Option.map(upper, outerBound),
        }),
        f,
        innerKeyLayout,
        onEmpty,
        {
          lower: combineLowerRefinements(
            refinements.lower,
            Option.filter(lower, FlatMapBound.$is("Inner")),
          ),
          upper: combineUpperRefinements(
            refinements.upper,
            Option.filter(upper, FlatMapBound.$is("Inner")),
          ),
        },
      );
    },
    // Refinements are key bounds, so they carry over; the inner streams
    // are reversed alongside the outer one to keep the direction rule.
    () =>
      makeFlatMap(
        reverse(self),
        (doc) => reverse(f(doc)),
        innerKeyLayout,
        onEmpty,
        refinements,
      ),
  );
};

/**
 * Keep the first document for each distinct value of a key prefix. Similar to
 * `Stream.changes` on that prefix, this groups consecutive equal keys, but
 * seeks past the rest of each group instead of scanning it.
 *
 * Pass a prefix of the visible ordering labels, such as `["text"]` for notes
 * ordered by text and creation time. Prefix validity is checked by TypeScript
 * and at runtime. On a `flatMap` result, a prefix reaching into the inner key
 * also groups by the outer document, including its ID.
 *
 * Operation order controls representative selection. Filter before `distinct`
 * to choose the first matching document, or after it to test only the selected
 * representative. `reverse(distinct(q))` keeps those representatives and flips
 * their output order; `distinct(reverse(q))` selects from the other direction.
 *
 * Narrowing after `distinct` filters the original representatives without
 * selecting replacements. Narrowing before it constrains the input and can
 * change the representatives. Preserving representatives may require extra
 * reads outside output bounds and repeated callback evaluation.
 *
 * @experimental
 */
export const distinct = dual<
  <const PrefixNames extends ReadonlyArray<string>>(
    prefixNames: PrefixNames,
  ) => <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels<
      readonly [...PrefixNames, ...ReadonlyArray<string>]
    >,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  <
    const PrefixNames extends ReadonlyArray<string>,
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels<
      readonly [...PrefixNames, ...ReadonlyArray<string>]
    >,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    prefixNames: PrefixNames,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>
>(2, (self, prefixNames) => {
  // Groups are runs of equal *runtime* prefixes, so a prefix that reaches
  // past a tiebreaker (into a `flatMap` result's inner key) includes it.
  return makeDistinct(
    self,
    Result.getOrThrowWith(
      QueryStreamKeyLayout.resolvePrefix(
        self.keyLayout,
        QueryStreamKeyLabels.make(prefixNames),
      ),
      identity,
    ),
    self.orderDirection,
    QueryStreamKeyBounds.unbounded(self.keyLayout),
  );
});

/**
 * Relabel visible key positions without changing values or their order. This
 * does not sort or transform emitted documents.
 *
 * Use it to merge indexes or tables ordered by comparable values under
 * different field names. For example, relabel comments ordered by `["body",
 * "_creationTime"]` as `["text", "_creationTime"]` to merge with notes ordered
 * by text. Map both streams to a common value shape first.
 *
 * Supply exactly as many replacement labels as the original visible labels. The
 * values at corresponding positions must be comparable; relabeling does not
 * establish that semantic compatibility for you. Implicit ID tiebreakers keep
 * their positions. For joined streams, replacement labels cover the combined
 * key, outer labels first.
 *
 * @experimental
 */
export const renameKey = dual<
  <const ReplacementNames extends ReadonlyArray<string>>(
    replacementNames: ReplacementNames,
  ) => <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels & {
      readonly length: ReplacementNames["length"];
    },
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<
    Doc,
    QueryStreamKeyLabels.QueryStreamKeyLabels<ReplacementNames>,
    OrderDirection,
    E,
    R
  >,
  <
    const ReplacementNames extends ReadonlyArray<string>,
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels & {
      readonly length: ReplacementNames["length"];
    },
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    replacementNames: ReplacementNames,
  ) => QueryStream<
    Doc,
    QueryStreamKeyLabels.QueryStreamKeyLabels<ReplacementNames>,
    OrderDirection,
    E,
    R
  >
>(2, (self, replacementNames) =>
  renameKeyImpl(self, QueryStreamKeyLabels.make(replacementNames)),
);

const renameKeyImpl = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  ReplacementKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  replacementKeyLabels: ReplacementKeyLabels,
): QueryStream<Doc, ReplacementKeyLabels, OrderDirection, E, R> => {
  const keyLayout = Result.getOrThrowWith(
    QueryStreamKeyLayout.rename(self.keyLayout, replacementKeyLabels),
    identity,
  );
  return new QueryStream(
    self.orderDirection,
    keyLayout,
    self.annotated,
    undefined,
    // Values keep their positions, but the parsed keys must be rebound to
    // the underlying layout's labels.
    (parsedBounds) =>
      renameKeyImpl(
        narrowByKeyBounds(self, QueryStreamKeyBounds.toBounds(parsedBounds)),
        replacementKeyLabels,
      ),
    () => renameKeyImpl(reverse(self), replacementKeyLabels),
  );
};

const makeDistinct = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<
    Doc,
    KeyLabels,
    QueryStreamOrderDirection.QueryStreamOrderDirection,
    E,
    R
  >,
  distinctLength: number,
  orderDirection: OrderDirection,
  parsedBounds: QueryStreamKeyBounds.ParsedBounds,
): QueryStream<Doc, KeyLabels, OrderDirection, E, R> => {
  const afterKeyValues = (
    keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
  ): QueryStreamKeyBounds.KeyBounds => {
    const pastGroup: QueryStreamKeyBounds.KeyBound = {
      keyValues,
      inclusive: false,
    };
    return orderDirection === "asc"
      ? { lower: Option.some(pastGroup), upper: Option.none() }
      : { lower: Option.none(), upper: Option.some(pastGroup) };
  };
  const groupBound = (
    bound: Option.Option<QueryStreamKeyBounds.ParsedBound>,
  ): Option.Option<QueryStreamKeyBounds.KeyBound> =>
    Option.map(bound, ({ inclusive, key }) => ({
      keyValues: Array.take(QueryStreamKey.keyValues(key), distinctLength),
      inclusive:
        QueryStreamKey.keyValues(key).length > distinctLength || inclusive,
    }));
  const { aboveLower, belowUpper } = keyPredicates(parsedBounds);
  const isAdmitted = (keyValues: QueryStreamKeyValues.QueryStreamKeyValues) =>
    aboveLower(keyValues) && belowUpper(keyValues);
  const annotated = Stream.unwrap(
    Effect.map(QueryStreamReadBudget.QueryStreamReadBudget, (readBudget) =>
      Stream.paginate(
        narrowByKeyBounds(
          orderDirection === self.orderDirection ? self : reverse(self),
          {
            lower: groupBound(parsedBounds.lower),
            upper: groupBound(parsedBounds.upper),
          },
        ),
        (
          current: QueryStream<
            Doc,
            KeyLabels,
            QueryStreamOrderDirection.QueryStreamOrderDirection,
            E,
            R
          >,
        ): Effect.Effect<
          readonly [ReadonlyArray<Element<Doc>>, Option.Option<typeof current>],
          E,
          R | QueryStreamReadBudget.QueryStreamReadBudget
        > =>
          Effect.gen(function* () {
            if (yield* readBudget.isStopped)
              return Tuple.make([], Option.none());
            const discovered = yield* Stream.runHead(current.annotated);
            if (Option.isNone(discovered)) return Tuple.make([], Option.none());
            const element = discovered.value;
            const { doc, keyValues } = element;
            const prefixKeyValues = Array.take(keyValues, distinctLength);
            if (orderDirection === self.orderDirection) {
              const nextKeyValues = Option.match(doc, {
                onNone: () => keyValues,
                onSome: () => prefixKeyValues,
              });
              return Tuple.make(
                isAdmitted(keyValues) ? [element] : [],
                Option.some(
                  narrowByKeyBounds(current, afterKeyValues(nextKeyValues)),
                ),
              );
            }
            const next = Option.some(
              narrowByKeyBounds(current, afterKeyValues(prefixKeyValues)),
            );
            const { firstKeyValues, selected } = yield* narrowByKeyBounds(
              self,
              {
                lower: Option.some({
                  keyValues: prefixKeyValues,
                  inclusive: true,
                }),
                upper: Option.some({
                  keyValues: prefixKeyValues,
                  inclusive: true,
                }),
              },
            ).annotated.pipe(
              Stream.run(
                Sink.fold(
                  () => ({
                    firstKeyValues:
                      Option.none<QueryStreamKeyValues.QueryStreamKeyValues>(),
                    selected: Option.none<Element<Doc>>(),
                  }),
                  (probe) => Option.isNone(probe.selected),
                  (probe, candidate: Element<Doc>) =>
                    Effect.succeed({
                      firstKeyValues: Option.orElse(probe.firstKeyValues, () =>
                        Option.some(candidate.keyValues),
                      ),
                      selected: Option.as(candidate.doc, candidate),
                    }),
                ),
              ),
            );
            if (Option.isSome(selected)) {
              const representative = selected.value;
              return Tuple.make(
                isAdmitted(representative.keyValues) ? [representative] : [],
                next,
              );
            }
            if (yield* readBudget.isStopped)
              return Tuple.make([], Option.none());
            const checkpointKeyValues = Option.getOrElse(
              firstKeyValues,
              () => keyValues,
            );
            return Tuple.make(
              isAdmitted(checkpointKeyValues)
                ? [
                    new Element({
                      doc: Option.none<Doc>(),
                      keyValues: checkpointKeyValues,
                    }),
                  ]
                : [],
              next,
            );
          }),
      ),
    ),
  );

  return new QueryStream(
    orderDirection,
    self.keyLayout,
    annotated,
    undefined,
    (incomingParsedBounds) =>
      makeDistinct(
        self,
        distinctLength,
        orderDirection,
        Result.getOrThrowWith(
          QueryStreamKeyBounds.intersect(parsedBounds, incomingParsedBounds),
          identity,
        ),
      ),
    () =>
      makeDistinct(
        self,
        distinctLength,
        QueryStreamOrderDirection.flip(orderDirection),
        parsedBounds,
      ),
  );
};

/**
 * Run a composed query stream in the opposite direction without changing its
 * key layout. Use this for bidirectional pagination: a reversed feed can load
 * its earlier pages.
 *
 * Reversal uses index scans and seeks rather than collecting and reversing
 * values. Merges, filters, maps, flat-maps (including their inner streams),
 * distinct streams, renamed streams, and empty streams all support it.
 *
 * `reverse(distinct(q))` retains each group's original first representative and
 * reverses their output order. `distinct(reverse(q))` instead chooses the first
 * document from the other direction. Preserving representatives can require
 * extra reads to discover groups and seek their original first documents.
 *
 * A manually constructed stream without `reverseWith` throws
 * `MissingReversalRecipeError`.
 *
 * @experimental
 */
export const reverse = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
): QueryStream<
  Doc,
  KeyLabels,
  QueryStreamOrderDirection.Flip<OrderDirection>,
  E,
  R
> => {
  if (self.reverseWith === undefined) {
    throw new MissingReversalRecipeError();
  }
  return self.reverseWith();
};

/**
 * Restrict a stream to keys between `start` and `end`. Provide at least one
 * endpoint, each with `keyValues` and a required `inclusive` flag; omit the
 * other endpoint to leave that side unbounded.
 *
 * Endpoints follow stream order: `start` is the lower key when ascending and
 * the upper key when descending. Repeated narrowing intersects existing bounds
 * and can only restrict the range further.
 *
 * A key may be a prefix of the full key. An inclusive prefix includes every key
 * extending it; an exclusive prefix excludes the whole group. For example,
 * creation-time bounds can use `[startTime]` and `[endTime]` without trailing
 * IDs. Equal endpoints produce an empty range unless both are inclusive, in
 * which case they select that key or prefix group.
 *
 * Bounds are pushed into index ranges where that preserves the composition's
 * results. On a distinct stream, full-key bounds filter original
 * representatives without choosing replacements; prefix bounds include or
 * exclude whole groups. This can require reads outside the output bounds. Apply
 * bounds before `distinct` instead to constrain which documents can represent a
 * group. Manually constructed streams without `narrowWith` are filtered in
 * memory.
 *
 * For pagination, pass the previous `continueCursor` unchanged to `paginate`;
 * do not decode a cursor into explicit bounds.
 *
 * @experimental
 */
export const narrow = dual<
  (
    narrowBounds: QueryStreamKeyBounds.NarrowBounds,
  ) => <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    narrowBounds: QueryStreamKeyBounds.NarrowBounds,
  ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>
>(
  2,
  <
    Doc,
    KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    E,
    R,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    narrowBounds: QueryStreamKeyBounds.NarrowBounds,
  ) => {
    const start = Option.fromUndefinedOr(narrowBounds.start);
    const end = Option.fromUndefinedOr(narrowBounds.end);
    // Stream space → ascending key space: for `desc`, "start" bounds from
    // above and "end" from below. Inclusion stays attached to its key.
    const keyBounds: QueryStreamKeyBounds.KeyBounds =
      self.orderDirection === "asc"
        ? { lower: start, upper: end }
        : { lower: end, upper: start };
    return narrowByKeyBounds(self, keyBounds);
  },
);

const narrowByKeyBounds = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  keyBounds: QueryStreamKeyBounds.KeyBounds,
): QueryStream<Doc, KeyLabels, OrderDirection, E, R> => {
  const parsedBounds = Result.getOrThrowWith(
    QueryStreamKeyBounds.parse(self.keyLayout, keyBounds),
    identity,
  );
  return narrowByParsedBounds(self, parsedBounds);
};

// Internal recipes share parsed bounds until their layout or coordinates change.
const narrowByParsedBounds = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  parsedBounds: QueryStreamKeyBounds.ParsedBounds,
): QueryStream<Doc, KeyLabels, OrderDirection, E, R> => {
  const unbounded =
    Option.isNone(parsedBounds.lower) && Option.isNone(parsedBounds.upper);
  if (!unbounded && self.narrowWith !== undefined)
    return self.narrowWith(parsedBounds);
  // Recipe calls check their layout in the constructor's wrapper. No-op and
  // in-memory narrowing need the same check even without a recipe call.
  Result.getOrThrowWith(
    QueryStreamKeyBounds.forLayout(self.keyLayout, parsedBounds),
    identity,
  );
  return unbounded ? self : narrowInMemory(self, parsedBounds);
};

/**
 * The fallback for streams that don't know how to rebuild themselves.
 */
const keyPredicates = (parsedBounds: QueryStreamKeyBounds.ParsedBounds) => {
  const complete = (keyValues: QueryStreamKeyValues.QueryStreamKeyValues) =>
    Result.getOrThrowWith(
      QueryStreamKey.complete(parsedBounds.keyLayout, keyValues),
      identity,
    );
  return {
    aboveLower: (keyValues: QueryStreamKeyValues.QueryStreamKeyValues) =>
      Result.getOrThrowWith(
        QueryStreamKeyBounds.admittedByLower(parsedBounds)(complete(keyValues)),
        identity,
      ),
    belowUpper: (keyValues: QueryStreamKeyValues.QueryStreamKeyValues) =>
      Result.getOrThrowWith(
        QueryStreamKeyBounds.admittedByUpper(parsedBounds)(complete(keyValues)),
        identity,
      ),
  };
};

const narrowInMemory = <
  Doc,
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
  parsedBounds: QueryStreamKeyBounds.ParsedBounds,
): QueryStream<Doc, KeyLabels, OrderDirection, E, R> => {
  type Narrower = (
    annotated: Stream.Stream<
      Element<Doc>,
      E,
      R | QueryStreamReadBudget.QueryStreamReadBudget
    >,
  ) => Stream.Stream<
    Element<Doc>,
    E,
    R | QueryStreamReadBudget.QueryStreamReadBudget
  >;

  const { aboveLower, belowUpper } = keyPredicates(parsedBounds);

  const dropOutOfRange: Narrower =
    self.orderDirection === "asc"
      ? Stream.dropWhile(({ keyValues }) => !aboveLower(keyValues))
      : Stream.dropWhile(({ keyValues }) => !belowUpper(keyValues));
  const takeInRange: Narrower =
    self.orderDirection === "asc"
      ? Stream.takeWhile(({ keyValues }) => belowUpper(keyValues))
      : Stream.takeWhile(({ keyValues }) => aboveLower(keyValues));

  return new QueryStream(
    self.orderDirection,
    self.keyLayout,
    pipe(self.annotated, dropOutOfRange, takeInRange),
    undefined,
    undefined,
    self.reverseWith === undefined
      ? undefined
      : () => narrowInMemory(reverse(self), parsedBounds),
  );
};

// -----------------------------------------------------------------------------
// Sinks
// -----------------------------------------------------------------------------

/**
 * `unique` found at least two emitted values. Narrow the query if at most one
 * value was expected, or use another consumer to handle multiple results.
 *
 * @experimental
 */
export class NotUniqueError extends Schema.TaggedError<NotUniqueError>()(
  "NotUniqueError",
  {},
) {
  override get message(): string {
    return "Expected the query stream to contain at most one document";
  }
}

/**
 * Consume a stream expected to emit at most one value. The effect returns
 * `None` for no values and `Some(value)` for one, or fails with
 * `NotUniqueError` for two or more. Like `Stream.runHead` with a uniqueness
 * check, it inspects at most two emitted values; finding them may read
 * additional filtered documents.
 *
 * @experimental
 */
export const unique = Effect.fn("QueryStream.unique")(
  <Doc, KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels, E, R>(
    self: QueryStream<
      Doc,
      KeyLabels,
      QueryStreamOrderDirection.QueryStreamOrderDirection,
      E,
      R
    >,
  ): Effect.Effect<Option.Option<Doc>, E | NotUniqueError, R> =>
    self.pipe(
      Stream.take(2),
      Stream.runCollect,
      Effect.flatMap((docs) =>
        docs.length >= 2
          ? Effect.fail(new NotUniqueError())
          : Effect.succeed(Array.head(docs)),
      ),
    ),
);

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

/**
 * Convex pagination options interpreted over a query stream's stored keys. Pass
 * a paginated query handler's `paginationOpts` directly to `paginate`.
 *
 * - `cursor`: required exclusive start boundary; `null` starts at the beginning.
 * - `numItems`: requested emitted values, excluding filtered documents. With an
 *   `endCursor`, it is not an item limit, but still informs split
 *   recommendations.
 * - `endCursor`: optional inclusive boundary returned by a previous page. Pins
 *   the page to a key range regardless of how many values it holds.
 * - `maximumRowsRead`: optional budget for physical document reads from
 *   underlying query-stream indexes, including filtered documents.
 * - `maximumBytesRead`: optional budget charging estimated document size on every
 *   read, not Convex's exact billed bytes. The final document can take the
 *   total over the limit because its size is known only after reading it.
 *
 * With `numItems: 0`, an existing cursor is returned unchanged with an empty
 * page and `isDone: false`; a null cursor dies with `EmptyInitialPageError`.
 *
 * @experimental
 */
export type PaginateOptions = ConvexPaginationOptions;

/**
 * One page in Convex's pagination result shape. Return the whole result to
 * reactive clients so they can pin and split pages; use `page` alone for a
 * one-shot read inside a handler.
 *
 * - `page`: emitted values, possibly empty despite progress past filtered keys.
 * - `continueCursor`: the next page's exclusive start. Pass it back unchanged as
 *   `cursor` while `isDone` is false.
 * - `splitCursor`: an optional interior boundary. Pin the left page with this as
 *   `endCursor`; start the right page here, retaining the original end.
 * - `pageStatus`: `"SplitRequired"` when a read budget stops at a safe boundary,
 *   or `"SplitRecommended"` when a pinned page grows too large or a page scans
 *   many keys. Both include a `splitCursor`; otherwise status may be absent.
 * - `isDone`: true confirms the stream's end. Reaching a pinned boundary does not
 *   prove completion. A split recommendation can report false even at the end,
 *   so handle splitting before requesting another page.
 *
 * @experimental
 */
export type PaginationResult<Doc> = ConvexPaginationResult<Doc>;

/**
 * Return an effect producing one page of a composed query stream. Start with
 * `cursor: null`, then pass each returned `continueCursor` back unchanged until
 * `isDone`. Cursors record key boundaries, not offsets or the last visible
 * document: filtered elements can advance the cursor without entering `page`.
 *
 * `cursor` is exclusive and `endCursor` is inclusive, in stream order. Without
 * an end boundary, `numItems` limits emitted values. With `endCursor`, the page
 * covers the pinned range regardless of its item count, keeping adjacent
 * reactive pages gap-free as data changes. See `PaginateOptions` for read
 * limits and the special case of a zero-sized request.
 *
 * Bounds are pushed into underlying index queries where possible, but composed
 * streams may read more documents than they return, including documents read on
 * earlier pages. Budgets count filtered documents, distinct-group discovery,
 * repeated seeks, merge prefetch, and both outer and inner query-stream reads
 * in joins. Arbitrary I/O inside callbacks, such as a separate lookup in
 * `mapEffect`, is not tracked.
 *
 * A budget-limited page returns `SplitRequired` at a safe logical boundary. If
 * the budget prevents safe progress or an interior split of a pinned page, the
 * effect fails with `ReadBudgetExceededError` rather than returning a
 * non-advancing cursor. Increase the budget or reduce the reads needed for
 * progress. See `PaginationResult` for split and completion handling.
 *
 * Malformed or incompatible cursors die with a `ConvexError` whose data is `{
 * paginationError: "InvalidCursor" }`; Confect's pagination clients restart
 * from the first page. Restart pagination whenever filters, ordering, or other
 * query semantics change, even if an old cursor is still accepted.
 *
 * Cursors expose boundary field names and key values, including document IDs.
 * They are neither opaque nor signed: clients can read or craft them. Do not
 * publicly paginate over sensitive indexed fields unless pinned with `eq`.
 * Never construct cursors from documents or decode them into `narrow` bounds.
 *
 * Return the whole result to reactive clients. React's
 * `useStreamPaginatedQuery` handles pinning, splitting, and invalid-cursor
 * resets; `usePaginatedQuery` does not support stream pages. Foldkit's
 * `PaginatedQuery` also supports them.
 *
 * @experimental
 */
export const paginate: {
  (
    options: PaginateOptions,
  ): <Doc, KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels, E, R>(
    self: QueryStream<
      Doc,
      KeyLabels,
      QueryStreamOrderDirection.QueryStreamOrderDirection,
      E,
      R
    >,
  ) => Effect.Effect<PaginationResult<Doc>, E | ReadBudgetExceededError, R>;
  <Doc, KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels, E, R>(
    self: QueryStream<
      Doc,
      KeyLabels,
      QueryStreamOrderDirection.QueryStreamOrderDirection,
      E,
      R
    >,
    options: PaginateOptions,
  ): Effect.Effect<PaginationResult<Doc>, E | ReadBudgetExceededError, R>;
} = dual(
  2,
  Effect.fn("QueryStream.paginate")(
    function* <
      Doc,
      KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
      E,
      R,
      OrderDirection extends
        QueryStreamOrderDirection.QueryStreamOrderDirection,
    >(
      self: QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
      options: PaginateOptions,
    ) {
      const cursorSchema = QueryStreamCursor.fromKeyLayout(self.keyLayout);
      const encodeCursor = Schema.encodeEffect(cursorSchema);
      const decodeCursor = Schema.decodeEffect(cursorSchema);
      const complete = (keyValues: QueryStreamKeyValues.QueryStreamKeyValues) =>
        Result.getOrThrowWith(
          QueryStreamKey.complete(self.keyLayout, keyValues),
          identity,
        );
      const decoded = yield* Effect.all({
        start: Option.match(Option.fromNullOr(options.cursor), {
          onNone: () => Effect.succeed(QueryStreamPagination.Start.Beginning()),
          onSome: (cursor) =>
            Effect.map(decodeCursor(cursor), (key) =>
              QueryStreamPagination.Start.After({
                cursor,
                key,
              }),
            ),
        }),
        range: Option.match(Option.fromNullishOr(options.endCursor), {
          onNone: () => Effect.succeed(QueryStreamPagination.Range.Unpinned()),
          onSome: (cursor) =>
            cursor === QueryStreamCursor.END_CURSOR
              ? Effect.succeed(QueryStreamPagination.Range.ThroughEnd())
              : Effect.map(decodeCursor(cursor), (key) =>
                  QueryStreamPagination.Range.ThroughKey({
                    key,
                  }),
                ),
        }),
      }).pipe(
        Effect.catchTag("SchemaError", () =>
          Effect.die(new ConvexError({ paginationError: "InvalidCursor" })),
        ),
      );
      const request = yield* QueryStreamPagination.parseRequest(
        options.numItems,
        decoded.start,
        decoded.range,
      ).pipe(
        Effect.fromResult,
        Effect.catchTags({
          InvalidPageSizeError: Effect.die,
          EmptyInitialPageError: Effect.die,
        }),
      );
      if (request._tag === "Unchanged") {
        return {
          page: [],
          isDone: false,
          continueCursor: request.cursor,
        } satisfies PaginationResult<Doc>;
      }
      const start = Option.map(request.after, (key) => ({
        key: QueryStreamKey.toPrefix(key),
        inclusive: false,
      }));
      const end = QueryStreamPagination.Range.$match(request.range, {
        Unpinned: () => Option.none<QueryStreamKeyBounds.ParsedBound>(),
        ThroughEnd: () => Option.none<QueryStreamKeyBounds.ParsedBound>(),
        ThroughKey: ({ key }) =>
          Option.some({
            key: QueryStreamKey.toPrefix(key),
            inclusive: true,
          }),
      });
      const narrowed = narrowByParsedBounds(
        self,
        Result.getOrThrowWith(
          QueryStreamKeyBounds.fromParsed(
            self.keyLayout,
            self.orderDirection === "asc"
              ? { lower: start, upper: end }
              : { lower: end, upper: start },
          ),
          identity,
        ),
      );
      const readBudget = yield* QueryStreamReadBudget.QueryStreamReadBudget;
      const collected = yield* Stream.run(
        narrowed.annotated,
        Sink.fold(
          () => QueryStreamPagination.initial<Doc>(),
          (state) => state._tag === "Reading",
          (state, { doc, keyValues }: Element<Doc>) =>
            Effect.map(readBudget.isExhausted, (hitLimit) =>
              QueryStreamPagination.record(
                request,
                state,
                doc,
                complete(keyValues),
                hitLimit,
              ),
            ),
        ),
      );
      const stopped = yield* readBudget.isStopped;
      const outcome = QueryStreamPagination.finish(request, collected, stopped);
      if (Result.isFailure(outcome)) {
        const counts = yield* readBudget.getReadCounts;
        return yield* new ReadBudgetExceededError(counts);
      }
      const encode = (key: QueryStreamKey.Complete) =>
        encodeCursor(key).pipe(Effect.catchTag("SchemaError", Effect.die));
      const encodeSplit = (
        result: Extract<
          QueryStreamPagination.Outcome<Doc>,
          { readonly _tag: "SplitRequired" | "SplitRecommended" }
        >,
      ) =>
        Effect.gen(function* () {
          const continueCursor = yield* Match.value(result.continuation).pipe(
            Match.tagsExhaustive({
              End: () => Effect.succeed(QueryStreamCursor.END_CURSOR),
              Key: ({ key }) => encode(key),
            }),
          );
          return {
            page: Array.fromIterable(result.page),
            isDone: false,
            continueCursor,
            pageStatus: result._tag,
            splitCursor: yield* encode(result.splitKey),
          } satisfies PaginationResult<Doc>;
        });
      return yield* Match.value(outcome.success).pipe(
        Match.tagsExhaustive({
          Done: ({ page }) =>
            Effect.succeed({
              page: Array.fromIterable(page),
              isDone: true,
              continueCursor: QueryStreamCursor.END_CURSOR,
            } satisfies PaginationResult<Doc>),
          Continue: ({ page, key }) =>
            Effect.map(
              encode(key),
              (continueCursor) =>
                ({
                  page: Array.fromIterable(page),
                  isDone: false,
                  continueCursor,
                }) satisfies PaginationResult<Doc>,
            ),
          SplitRequired: encodeSplit,
          SplitRecommended: encodeSplit,
        }),
      );
    },
    (effect, _self, options) =>
      Effect.provideServiceEffect(
        effect,
        QueryStreamReadBudget.QueryStreamReadBudget,
        Schema.decodeEffect(QueryStreamReadBudget.Limits)(options).pipe(
          Effect.catchTag("SchemaError", (cause) =>
            Effect.die(
              new QueryStreamReadBudget.InvalidReadLimitError({ cause }),
            ),
          ),
          Effect.flatMap(QueryStreamReadBudget.make),
        ),
      ),
  ),
);
