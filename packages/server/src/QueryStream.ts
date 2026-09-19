/**
 * Compose, merge, join, and paginate index queries as Effect streams.
 *
 * A query stream is an Effect `Stream` of decoded documents with an order key
 * and direction. Create one with `reader.table(...).stream(index, range?,
 * order?)` for a standard index. The order defaults to `"asc"`; search indexes
 * use `reader.table(...).search(...)` instead. Unlike
 * `reader.table(...).index(...).stream()`, this returns a composable query
 * stream rather than a plain `Stream` over one query.
 *
 * Creating or composing a stream does not read documents. Reads begin when you
 * run a consuming effect, such as `Stream.runCollect` or `paginate`, and each
 * run executes the queries again. Keep callbacks deterministic and read-only:
 * pagination, seeks, and reversal can reevaluate them.
 *
 * Order keys are stored separately from emitted values. Pinning an index field
 * with `eq` removes it from the key; range bounds keep it. Keys retain creation
 * time and document-ID tiebreakers where applicable. `QueryStream` combinators
 * preserve the ordering information needed to merge and paginate; plain
 * `Stream` transforms return ordinary streams without that information.
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
import type {
  QueryStreamOrderDirection as OrderDirection,
  Flip,
} from "./QueryStreamOrderDirection";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";
import * as QueryStreamIndexPrefix from "./QueryStreamIndexPrefix";
import * as QueryStreamKey from "./QueryStreamKey";
import * as QueryStreamKeyBounds from "./QueryStreamKeyBounds";
import type {
  KeyBound,
  KeyBounds,
  IndexBounds,
  NarrowBounds,
  ParsedBound,
  ParsedBounds,
} from "./QueryStreamKeyBounds";
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
  readonly expectedOrder: OrderDirection;
  readonly actualOrder: OrderDirection;
  readonly expectedLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly actualLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
}> {
  override get message(): string {
    return `QueryStream.merge: all streams must share an order and order-key layout (got ${this.expectedOrder} ${QueryStreamKeyLayout.format(this.expectedLayout)} and ${this.actualOrder} ${QueryStreamKeyLayout.format(this.actualLayout)})`;
  }
}

/**
 * A `flatMap` inner stream runs in a different direction from its outer stream.
 * The join dies with this error when it runs; `expected` is the outer direction
 * and `actual` is the inner direction.
 *
 * @experimental
 */
export class InnerStreamOrderMismatchError extends Data.TaggedError(
  "InnerStreamOrderMismatchError",
)<{
  readonly expected: OrderDirection;
  readonly actual: OrderDirection;
}> {
  override get message(): string {
    return `QueryStream.flatMap: inner stream order (${this.actual}) differs from the outer stream's (${this.expected})`;
  }
}

/**
 * A `flatMap` inner stream does not match the supplied `innerLayout`, including
 * visible labels and implicit-ID positions. The join dies with this error when
 * it runs; the payload contains the expected and actual layouts.
 *
 * @experimental
 */
export class InnerStreamLayoutMismatchError extends Data.TaggedError(
  "InnerStreamLayoutMismatchError",
)<{
  readonly expected: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly actual: QueryStreamKeyLayout.QueryStreamKeyLayout;
}> {
  override get message(): string {
    return `QueryStream.flatMap: inner stream order-key layout (${QueryStreamKeyLayout.format(this.actual)}) differs from innerLayout (${QueryStreamKeyLayout.format(this.expected)})`;
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
 * A decoded value and its stored order key. `doc: None` marks an element that
 * was read but filtered out: it emits no value, but still advances cursors.
 * Mapping a value does not recompute its key.
 *
 * @experimental
 */
export class Element<Doc> extends Data.Class<{
  readonly doc: Option.Option<Doc>;
  readonly orderKey: QueryStreamOrderKey.QueryStreamOrderKey;
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
 * - `Labels` names the visible ordering positions, initially the index fields not
 *   pinned by `eq`. `flatMap` appends labels and `renameKey` replaces them.
 *   Implicit ID tiebreakers are omitted from labels but retained in
 *   `keyLayout`.
 * - `Direction` is `"asc"` or `"desc"`; the type defaults to their union.
 * - `E` contains typed failures while reading or transforming values. `never`
 *   means no typed failures, not no defects.
 * - `R` contains Effect services required to run the stream. The stream retains
 *   the database access supplied at creation, so it doesn't require providing
 *   `DatabaseReader` again; effectful callbacks can add requirements.
 *
 * Known label or direction mismatches prevent merging at compile time. Runtime
 * checks also compare implicit-ID positions. Reuse a compatible stream's
 * `keyLayout` for `empty` or `flatMap`'s `innerLayout`.
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
  Labels extends ReadonlyArray<string> = ReadonlyArray<string>,
  out Direction extends OrderDirection = OrderDirection,
  out E = never,
  out R = never,
> implements Stream.Stream<Doc, E, R> {
  declare readonly [TypeId]: TypeId;
  declare readonly "~labels": Types.Invariant<Labels>;
  declare readonly "~direction": Types.Covariant<Direction>;

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
    readonly order: Direction,
    readonly keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<Labels>,
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
      bounds: ParsedBounds,
    ) => QueryStream<Doc, Labels, Direction, E, R>,
    /**
     * Rebuilds the stream in the opposite direction using index scans and
     * seeks. Distinct streams keep their original representatives. Without this
     * recipe, `reverse` throws `MissingReversalRecipeError`.
     */
    readonly reverseWith?: () => QueryStream<
      Doc,
      Labels,
      Flip<Direction>,
      E,
      R
    >,
  ) {
    if (narrowWith !== undefined) {
      this.narrowWith = (bounds) =>
        narrowWith(
          Result.getOrThrowWith(
            QueryStreamKeyBounds.forLayout(keyLayout, bounds),
            identity,
          ),
        );
    }
  }

  toStream(): Stream.Stream<Doc, E, R> {
    return Stream.unwrap(
      Effect.gen({ self: this }, function* () {
        const budget = yield* Effect.serviceOption(
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
            budget,
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
 * Create a stream with no documents but a known order-key layout and direction.
 * Use it when a dynamic list of streams is empty, since `merge` requires at
 * least one input. The direction defaults to `"asc"`.
 *
 * Supply the document type in the first call, then reuse a compatible stream's
 * layout: `QueryStream.empty<NotesDoc>()(source.keyLayout, "desc")`. Creating
 * the source solely to obtain its layout does not read documents.
 *
 * @experimental
 */
export const empty =
  <Doc>(): {
    <const Labels extends ReadonlyArray<string>>(
      keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<Labels>,
    ): QueryStream<Doc, Labels, "asc", never, never>;
    <
      const Labels extends ReadonlyArray<string>,
      Direction extends OrderDirection,
    >(
      keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<Labels>,
      order: Direction,
    ): QueryStream<Doc, Labels, Direction, never, never>;
  } =>
  (
    keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
    order: OrderDirection = "asc",
  ) => {
    // `any` in the key and direction slots: the overloads above assign the
    // literal types the caller supplied.
    const make = (
      direction: OrderDirection,
    ): QueryStream<Doc, any, any, never, never> =>
      new QueryStream(
        direction,
        keyLayout,
        Stream.empty,
        undefined,
        // Narrowing nothing is nothing, and so is reversing it.
        () => make(direction),
        () => make(QueryStreamOrderDirection.flip(direction)),
      );
    return make(order);
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
      order(order: OrderDirection): AsyncIterable<unknown>;
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
export interface Reflection<Direction extends OrderDirection = OrderDirection> {
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
   * from the stream's order key; range bounds do not.
   */
  readonly range: QueryStreamIndexRange.QueryStreamIndexRange;
  readonly order: Direction;
  /**
   * Effective bounds in full index-key values, including pinned fields and ID
   * tiebreakers. If absent, bounds come from `range`; supplied bounds intersect
   * those constraints rather than replacing them.
   */
  readonly bounds?: IndexBounds;
}

/**
 * Create a reusable query stream from an index-query description. Prefer
 * `reader.table(...).stream(...)` for inferred document and ordering types.
 *
 * Construction does not read documents. Each consuming run rebuilds the index
 * queries within the supplied range and decodes their documents, failing with
 * `DocumentDecodeError` if decoding fails. Order keys come from encoded index
 * values before decoding, with equality-pinned fields removed.
 *
 * @experimental
 */
export const fromReflection = <
  Doc,
  Direction extends OrderDirection = OrderDirection,
>(
  reflection: Reflection<Direction>,
): QueryStream<
  Doc,
  ReadonlyArray<string>,
  Direction,
  Document.DocumentDecodeError,
  never
> =>
  makeLeaf(
    reflection,
    reflection.bounds === undefined
      ? QueryStreamIndexRange.toBounds(reflection.range)
      : QueryStreamKeyBounds.intersectIndexBounds(
          QueryStreamIndexRange.toBounds(reflection.range),
          reflection.bounds,
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

const makeLeaf = <Doc, Direction extends OrderDirection>(
  reflection: Reflection<Direction>,
  bounds: IndexBounds,
): QueryStream<
  Doc,
  ReadonlyArray<string>,
  Direction,
  Document.DocumentDecodeError,
  never
> => {
  // Bounds and range splitting work in full index-key space: the index's
  // fields plus the implicit `_id` tiebreaker (already explicit for
  // `by_id`). Convex accepts range constraints on `_creationTime` and
  // `_id` even though its index types don't advertise them.
  const fullFieldPaths = completeFieldPaths(reflection.indexFieldPaths);
  const equalityPrefixLength = QueryStreamIndexRange.equalityPrefixLength(
    reflection.range,
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
  const eqValues = Array.take(bounds.lower.orderKey, equalityPrefixLength);
  const ranges = Result.getOrThrowWith(
    QueryStreamIndexRange.fromBounds(fullFieldPaths, reflection.order, bounds),
    identity,
  );

  const encodedDocuments = Stream.fromIterable(ranges).pipe(
    Stream.flatMap((range) =>
      Stream.suspend(() =>
        Stream.fromAsyncIterable(
          reflection.reader
            .query(reflection.tableName)
            .withIndex(reflection.indexName, (q) =>
              QueryStreamIndexRange.apply(range, q),
            )
            .order(reflection.order),
          identity,
        ).pipe(Stream.orDie),
      ),
    ),
  );

  const budgetedDocuments = Stream.unwrap(
    Effect.map(QueryStreamReadBudget.QueryStreamReadBudget, (budget) =>
      budget.accountFor(encodedDocuments),
    ),
  );

  const annotated = budgetedDocuments.pipe(
    Stream.mapEffect((encoded) =>
      Effect.map(
        Document.decode(reflection.tableName, reflection.tableSchema)(encoded),
        (doc) =>
          new Element({
            doc: Option.some(doc as Doc),
            orderKey: QueryStreamOrderKey.extract(
              encoded as Record.ReadonlyRecord<string, unknown>,
              keyPaths,
            ),
          }),
      ),
    ),
  );

  const toFullKeySpace = (bound: ParsedBound): KeyBound => ({
    orderKey: QueryStreamIndexPrefix.values(
      Result.getOrThrowWith(
        QueryStreamIndexPrefix.fromStreamKey(
          fullFieldPaths,
          eqValues,
          bound.orderKey,
        ),
        identity,
      ),
    ),
    inclusive: bound.inclusive,
  });

  return new QueryStream(
    reflection.order,
    keyLayout,
    annotated,
    { ...reflection, bounds },
    (keyBounds) =>
      makeLeaf(reflection, {
        lower: Option.match(keyBounds.lower, {
          onNone: () => bounds.lower,
          onSome: (bound) =>
            QueryStreamKeyBounds.tightestLower(
              bounds.lower,
              toFullKeySpace(bound),
            ),
        }),
        upper: Option.match(keyBounds.upper, {
          onNone: () => bounds.upper,
          onSome: (bound) =>
            QueryStreamKeyBounds.tightestUpper(
              bounds.upper,
              toFullKeySpace(bound),
            ),
        }),
      }),
    // Bounds live in ascending key space, so the reversed leaf keeps them.
    () =>
      makeLeaf(
        {
          ...reflection,
          order: QueryStreamOrderDirection.flip(reflection.order),
        },
        bounds,
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
            const budget = yield* QueryStreamReadBudget.QueryStreamReadBudget;
            return (yield* budget.isStopped)
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
  <Doc, E>(
    PositionOrder: Order.Order<QueryStreamOrderKey.QueryStreamOrderKey>,
  ) =>
  (
    sources: ReadonlyArray<MergeSource<Doc, E>>,
  ): Effect.Effect<
    readonly [Element<Doc>, ReadonlyArray<MergeSource<Doc, E>>] | undefined,
    E,
    QueryStreamReadBudget.QueryStreamReadBudget
  > =>
    Effect.gen(function* () {
      const budget = yield* QueryStreamReadBudget.QueryStreamReadBudget;
      const filled = yield* Effect.forEach(sources, fillMergeSource, {
        concurrency: (yield* budget.isUnlimited) ? "unbounded" : 1,
      });
      if (filled.some((source) => MergeSource.$is("BudgetLimited")(source)))
        return undefined;
      const isEarlier = Order.isLessThan(PositionOrder);

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
                    isEarlier(head.orderKey, bestElement.orderKey)
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
 * Combine streams sharing an order key into one stream in key order. Use this
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
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, Labels, Direction, E, R>,
    ...ReadonlyArray<QueryStream<Doc, Labels, NoInfer<Direction>, E, R>>,
  ],
): QueryStream<Doc, Labels, Direction, E, R> => {
  const head = Array.headNonEmpty(streams);
  const incompatible = Array.findFirst(
    Array.tailNonEmpty(streams),
    (stream) =>
      stream.order !== head.order ||
      !QueryStreamKeyLayout.compatible(stream.keyLayout, head.keyLayout),
  );
  if (Option.isSome(incompatible)) {
    throw new IncompatibleStreamsError({
      expectedOrder: head.order,
      actualOrder: incompatible.value.order,
      expectedLayout: head.keyLayout,
      actualLayout: incompatible.value.keyLayout,
    });
  }
  return mergeUnchecked(streams);
};

/**
 * `merge` without the compatibility check—for re-merging branches that were
 * validated when the merge was built (narrowing never changes a branch's order
 * or key fields).
 */
const mergeUnchecked = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, Labels, Direction, E, R>,
    ...ReadonlyArray<QueryStream<Doc, Labels, Direction, E, R>>,
  ],
): QueryStream<Doc, Labels, Direction, E, R> => {
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
          mergeStep<Doc, E>(QueryStreamOrderKey.PositionOrder(head.order)),
        ),
    ),
  );

  return new QueryStream(
    head.order,
    head.keyLayout,
    annotated,
    undefined,
    // Narrowing a merge narrows every branch; the bounds are in the shared
    // order-key space, so each branch converts them to its own index-key
    // space itself.
    (keyBounds) =>
      mergeUnchecked([
        narrowByParsedBounds(head, keyBounds),
        ...Array.map(Array.tailNonEmpty(streams), (stream) =>
          narrowByParsedBounds(stream, keyBounds),
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
 * possibly changed) or `None` (drop). Order keys are preserved and dropped
 * elements stay in cursor accounting as read-but-filtered, so the result
 * remains mergeable and paginable; narrowing narrows the input and re-applies
 * the transform, so cursor bounds keep pushing down to leaves.
 */
const transform = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  f: (doc: Doc) => Option.Option<Doc2>,
): QueryStream<Doc2, Labels, Direction, E, R> =>
  new QueryStream(
    self.order,
    self.keyLayout,
    Stream.map(
      self.annotated,
      ({ doc, orderKey }) =>
        new Element({ doc: Option.flatMap(doc, f), orderKey }),
    ),
    undefined,
    (keyBounds) => transform(narrowByParsedBounds(self, keyBounds), f),
    () => transform(reverse(self), f),
  );

/**
 * The effectful {@link transform}.
 */
const transformEffect = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  E2,
  R2,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  f: (doc: Doc) => Effect.Effect<Option.Option<Doc2>, E2, R2>,
  options: EffectOptions | undefined,
): QueryStream<Doc2, Labels, Direction, E | E2, R | R2> =>
  new QueryStream(
    self.order,
    self.keyLayout,
    Stream.mapEffect(
      self.annotated,
      ({ doc, orderKey }) =>
        Option.match(doc, {
          onNone: () =>
            Effect.succeed(new Element({ doc: Option.none<Doc2>(), orderKey })),
          onSome: (value) =>
            Effect.map(
              f(value),
              (mapped) => new Element({ doc: mapped, orderKey }),
            ),
        }),
      // Order is preserved at any concurrency: elements are emitted in
      // input order however their effects finish.
      { concurrency: options?.concurrency },
    ),
    undefined,
    (keyBounds) =>
      transformEffect(narrowByParsedBounds(self, keyBounds), f, options),
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
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc, Labels, Direction, E, R>,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    predicate: (doc: Doc) => boolean,
  ) => QueryStream<Doc, Labels, Direction, E, R>
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
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc, Labels, Direction, E | E2, R | R2>,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    E2,
    R2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc, Labels, Direction, E | E2, R | R2>
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
 * Transform emitted values with a pure function while keeping their stored
 * order keys. The result retains merge and pagination support, unlike the plain
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
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc2, Labels, Direction, E, R>,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    f: (doc: Doc) => Doc2,
  ) => QueryStream<Doc2, Labels, Direction, E, R>
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
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc2, Labels, Direction, E | E2, R | R2>,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    E2,
    R2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc2, Labels, Direction, E | E2, R | R2>
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
 * Supply `options.innerLayout` from a compatible stream's `keyLayout`. For
 * example, comments indexed by `noteId` and pinned to a note have the same
 * layout as comments ordered by creation time. For nested joins or renamed
 * streams, reuse a compatible composed layout instead.
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
    InnerLabels extends ReadonlyArray<string>,
    E2,
    R2,
    Direction extends OrderDirection,
    Doc3 = never,
  >(
    f: (doc: Doc) => QueryStream<Doc2, InnerLabels, Direction, E2, R2>,
    options: {
      readonly innerLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<
        NoInfer<InnerLabels>
      >;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => <Labels extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<
    Doc2 | Doc3,
    readonly [...Labels, ...InnerLabels],
    Direction,
    E | E2,
    R | R2
  >,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    InnerLabels extends ReadonlyArray<string>,
    E2,
    R2,
    Direction extends OrderDirection,
    Doc3 = never,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    f: (doc: Doc) => QueryStream<Doc2, InnerLabels, NoInfer<Direction>, E2, R2>,
    options: {
      readonly innerLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<
        NoInfer<InnerLabels>
      >;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => QueryStream<
    Doc2 | Doc3,
    readonly [...Labels, ...InnerLabels],
    Direction,
    E | E2,
    R | R2
  >
>(3, (self, f, options): Any => {
  return makeFlatMap(
    self,
    f,
    options.innerLayout,
    Option.fromUndefinedOr(options.onEmpty),
    { lower: Option.none(), upper: Option.none() },
  );
});

/**
 * Inner bounds that apply only to the outer row whose key is `outer`.
 */
interface InnerRefinement {
  readonly outer: QueryStreamOrderKey.QueryStreamOrderKey;
  readonly inner: ParsedBound;
}

interface InnerRefinements {
  readonly lower: Option.Option<InnerRefinement>;
  readonly upper: Option.Option<InnerRefinement>;
}

type FlatMapBound = Data.TaggedEnum<{
  Outer: KeyBound;
  Inner: InnerRefinement;
}>;

const FlatMapBound = Data.taggedEnum<FlatMapBound>();

const combineLowerRefinements = (
  existing: Option.Option<InnerRefinement>,
  incoming: Option.Option<InnerRefinement>,
): Option.Option<InnerRefinement> =>
  Option.orElse(
    Option.zipWith(existing, incoming, (left, right) => {
      const ordering = QueryStreamOrderKey.Order(left.outer, right.outer);
      return ordering > 0
        ? left
        : ordering < 0
          ? right
          : {
              outer: left.outer,
              inner: Result.getOrThrowWith(
                QueryStreamKeyBounds.tightestParsedLower(
                  left.inner,
                  right.inner,
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
      const ordering = QueryStreamOrderKey.Order(left.outer, right.outer);
      return ordering < 0
        ? left
        : ordering > 0
          ? right
          : {
              outer: left.outer,
              inner: Result.getOrThrowWith(
                QueryStreamKeyBounds.tightestParsedUpper(
                  left.inner,
                  right.inner,
                ),
                identity,
              ),
            };
    }),
    () => Option.orElse(existing, () => incoming),
  );

const makeFlatMap = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  InnerLabels extends ReadonlyArray<string>,
  E2,
  R2,
  Direction extends OrderDirection,
  Doc3 = never,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  f: (doc: Doc) => QueryStream<Doc2, InnerLabels, Direction, E2, R2>,
  innerLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<InnerLabels>,
  /**
   * What an outer document with no inner rows emits, if it is kept.
   */
  onEmpty: Option.Option<(doc: Doc) => Doc3>,
  refinements: InnerRefinements,
): QueryStream<
  Doc2 | Doc3,
  readonly [...Labels, ...InnerLabels],
  Direction,
  E | E2,
  R | R2
> => {
  const outerLength = QueryStreamKeyLayout.runtimeWidth(self.keyLayout);
  const keyLayout = QueryStreamKeyLayout.concat(self.keyLayout, innerLayout);
  // The inner key of an outer document that contributes no inner elements
  // (filtered out, or an empty inner stream).
  const nullPadding: QueryStreamOrderKey.QueryStreamOrderKey = Array.makeBy(
    QueryStreamKeyLayout.runtimeWidth(innerLayout),
    () => null,
  );

  // Logical key types omit hidden IDs, and directions may be unions.
  // Validate every returned stream, including later rows and later runs.
  const validated = (
    inner: QueryStream<Doc2, InnerLabels, Direction, E2, R2>,
  ): QueryStream<Doc2, InnerLabels, Direction, E2, R2> => {
    if (inner.order !== self.order) {
      throw new InnerStreamOrderMismatchError({
        expected: self.order,
        actual: inner.order,
      });
    }
    if (!QueryStreamKeyLayout.compatible(inner.keyLayout, innerLayout)) {
      throw new InnerStreamLayoutMismatchError({
        expected: innerLayout,
        actual: inner.keyLayout,
      });
    }
    return inner;
  };

  const innerBoundsFor = (
    outerKey: QueryStreamOrderKey.QueryStreamOrderKey,
  ): ParsedBounds =>
    Result.getOrThrowWith(
      QueryStreamKeyBounds.fromParsed(innerLayout, {
        lower: Option.map(
          Option.filter(
            refinements.lower,
            (refinement) =>
              QueryStreamOrderKey.Order(outerKey, refinement.outer) === 0,
          ),
          (refinement) => refinement.inner,
        ),
        upper: Option.map(
          Option.filter(
            refinements.upper,
            (refinement) =>
              QueryStreamOrderKey.Order(outerKey, refinement.outer) === 0,
          ),
          (refinement) => refinement.inner,
        ),
      }),
      identity,
    );

  // The single element an outer document contributes when it has no inner
  // elements: filtered (cursor accounting only), or—for a left join—the
  // `onEmpty` placeholder. Either sits at the outer key followed by `null`s,
  // and is emitted only if that position is within the inner bounds.
  const markerStream = (
    outerKey: QueryStreamOrderKey.QueryStreamOrderKey,
    innerBounds: ParsedBounds,
    doc: Option.Option<Doc2 | Doc3>,
  ): Stream.Stream<Element<Doc2 | Doc3>> => {
    const { aboveLower, belowUpper } = keyPredicates(innerBounds);
    return aboveLower(nullPadding) && belowUpper(nullPadding)
      ? Stream.succeed(
          new Element({
            doc,
            orderKey: Array.appendAll(outerKey, nullPadding),
          }),
        )
      : Stream.empty;
  };

  const annotated: Stream.Stream<
    Element<Doc2 | Doc3>,
    E | E2,
    R | R2 | QueryStreamReadBudget.QueryStreamReadBudget
  > = self.annotated.pipe(
    Stream.flatMap(({ doc: outerDoc, orderKey: outerKey }) => {
      const innerBounds = innerBoundsFor(outerKey);
      return Option.match(outerDoc, {
        onNone: () => markerStream(outerKey, innerBounds, Option.none()),
        onSome: (doc) => {
          const inner = validated(f(doc));
          return narrowByParsedBounds(inner, innerBounds).annotated.pipe(
            Stream.map(
              ({ doc: innerDoc, orderKey: innerKey }) =>
                new Element({
                  doc: innerDoc,
                  orderKey: Array.appendAll(outerKey, innerKey),
                }),
            ),
            Stream.orElseIfEmpty(() =>
              Stream.unwrap(
                Effect.gen(function* () {
                  const budget =
                    yield* QueryStreamReadBudget.QueryStreamReadBudget;
                  if (yield* budget.isStopped) return Stream.empty;
                  const original = yield* Option.match(
                    Option.gen(function* () {
                      yield* onEmpty;
                      return yield* Option.orElse(
                        innerBounds.lower,
                        () => innerBounds.upper,
                      );
                    }),
                    {
                      onNone: () =>
                        Effect.succeed(Option.none<Element<Doc2>>()),
                      onSome: () => Stream.runHead(inner.annotated),
                    },
                  );
                  const isStopped = yield* budget.isStopped;
                  return Option.match(original, {
                    onSome: () => Stream.empty,
                    onNone: () =>
                      isStopped
                        ? Stream.empty
                        : markerStream(
                            outerKey,
                            innerBounds,
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

  const split = (bound: ParsedBound): FlatMapBound => {
    const orderKey = QueryStreamKey.values(bound.orderKey);
    const { inclusive } = bound;
    return orderKey.length <= outerLength
      ? FlatMapBound.Outer({ orderKey, inclusive })
      : FlatMapBound.Inner({
          outer: Array.take(orderKey, outerLength),
          inner: Result.getOrThrowWith(
            QueryStreamKeyBounds.parseBound(innerLayout, {
              orderKey: Array.drop(orderKey, outerLength),
              inclusive,
            }),
            identity,
          ),
        });
  };

  const outerBound = (bound: FlatMapBound): KeyBound =>
    FlatMapBound.$match(bound, {
      Outer: ({ orderKey, inclusive }) => ({ orderKey, inclusive }),
      Inner: ({ outer }) => ({ orderKey: outer, inclusive: true }),
    });

  return new QueryStream(
    self.order,
    keyLayout,
    annotated,
    undefined,
    (bounds) => {
      const lower = Option.map(bounds.lower, split);
      const upper = Option.map(bounds.upper, split);
      return makeFlatMap(
        narrowByKeyBounds(self, {
          lower: Option.map(lower, outerBound),
          upper: Option.map(upper, outerBound),
        }),
        f,
        innerLayout,
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
        innerLayout,
        onEmpty,
        refinements,
      ),
  );
};

/**
 * Keep the first document for each distinct value of an order-key prefix.
 * Similar to `Stream.changes` on that prefix, this groups consecutive equal
 * keys, but seeks past the rest of each group instead of scanning it.
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
  <const PrefixLabels extends ReadonlyArray<string>>(
    prefixLabels: PrefixLabels,
  ) => <
    Doc,
    Labels extends readonly [...PrefixLabels, ...ReadonlyArray<string>],
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc, Labels, Direction, E, R>,
  <
    const PrefixLabels extends ReadonlyArray<string>,
    Doc,
    Labels extends readonly [...PrefixLabels, ...ReadonlyArray<string>],
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    prefixLabels: PrefixLabels,
  ) => QueryStream<Doc, Labels, Direction, E, R>
>(2, (self, prefixLabels) => {
  // Groups are runs of equal *runtime* prefixes, so a prefix that reaches
  // past a tiebreaker (into a `flatMap` result's inner key) includes it.
  return makeDistinct(
    self,
    Result.getOrThrowWith(
      QueryStreamKeyLayout.resolvePrefix(
        self.keyLayout,
        QueryStreamKeyLabels.make(prefixLabels),
      ),
      identity,
    ),
    self.order,
    QueryStreamKeyBounds.unbounded(self.keyLayout),
  );
});

/**
 * Relabel visible order-key positions without changing values or their order.
 * This does not sort or transform emitted documents.
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
  <const ReplacementLabels extends ReadonlyArray<string>>(
    replacementLabels: ReplacementLabels,
  ) => <
    Doc,
    Labels extends ReadonlyArray<string> & {
      readonly length: ReplacementLabels["length"];
    },
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc, Types.Mutable<ReplacementLabels>, Direction, E, R>,
  <
    const ReplacementLabels extends ReadonlyArray<string>,
    Doc,
    Labels extends ReadonlyArray<string> & {
      readonly length: ReplacementLabels["length"];
    },
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    replacementLabels: ReplacementLabels,
  ) => QueryStream<Doc, Types.Mutable<ReplacementLabels>, Direction, E, R>
>(2, (self, replacementLabels) =>
  renameKeyImpl(self, QueryStreamKeyLabels.make(replacementLabels)),
);

const renameKeyImpl = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  ReplacementLabels extends ReadonlyArray<string>,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  replacementLabels: QueryStreamKeyLabels.QueryStreamKeyLabels<ReplacementLabels>,
): QueryStream<Doc, Types.Mutable<ReplacementLabels>, Direction, E, R> => {
  const keyLayout = Result.getOrThrowWith(
    QueryStreamKeyLayout.rename(self.keyLayout, replacementLabels),
    identity,
  );
  return new QueryStream(
    self.order,
    keyLayout,
    self.annotated,
    undefined,
    // Values keep their positions, but the parsed keys must be rebound to
    // the underlying layout's labels.
    (bounds) =>
      renameKeyImpl(
        narrowByKeyBounds(self, QueryStreamKeyBounds.toBounds(bounds)),
        replacementLabels,
      ),
    () => renameKeyImpl(reverse(self), replacementLabels),
  );
};

const makeDistinct = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, OrderDirection, E, R>,
  distinctLength: number,
  order: Direction,
  bounds: ParsedBounds,
): QueryStream<Doc, Labels, Direction, E, R> => {
  const afterKey = (
    orderKey: QueryStreamOrderKey.QueryStreamOrderKey,
  ): KeyBounds => {
    const pastGroup: KeyBound = {
      orderKey,
      inclusive: false,
    };
    return order === "asc"
      ? { lower: Option.some(pastGroup), upper: Option.none() }
      : { lower: Option.none(), upper: Option.some(pastGroup) };
  };
  const groupBound = (
    bound: Option.Option<ParsedBound>,
  ): Option.Option<KeyBound> =>
    Option.map(bound, ({ inclusive, orderKey }) => ({
      orderKey: Array.take(QueryStreamKey.values(orderKey), distinctLength),
      inclusive:
        QueryStreamKey.values(orderKey).length > distinctLength || inclusive,
    }));
  const { aboveLower, belowUpper } = keyPredicates(bounds);
  const isAdmitted = (orderKey: QueryStreamOrderKey.QueryStreamOrderKey) =>
    aboveLower(orderKey) && belowUpper(orderKey);
  const annotated = Stream.unwrap(
    Effect.map(QueryStreamReadBudget.QueryStreamReadBudget, (budget) =>
      Stream.paginate(
        narrowByKeyBounds(order === self.order ? self : reverse(self), {
          lower: groupBound(bounds.lower),
          upper: groupBound(bounds.upper),
        }),
        (
          current: QueryStream<Doc, Labels, OrderDirection, E, R>,
        ): Effect.Effect<
          readonly [ReadonlyArray<Element<Doc>>, Option.Option<typeof current>],
          E,
          R | QueryStreamReadBudget.QueryStreamReadBudget
        > =>
          Effect.gen(function* () {
            if (yield* budget.isStopped) return Tuple.make([], Option.none());
            const discovered = yield* Stream.runHead(current.annotated);
            if (Option.isNone(discovered)) return Tuple.make([], Option.none());
            const element = discovered.value;
            const { doc, orderKey } = element;
            const prefix = Array.take(orderKey, distinctLength);
            if (order === self.order) {
              const nextKey = Option.match(doc, {
                onNone: () => orderKey,
                onSome: () => prefix,
              });
              return Tuple.make(
                isAdmitted(orderKey) ? [element] : [],
                Option.some(narrowByKeyBounds(current, afterKey(nextKey))),
              );
            }
            const next = Option.some(
              narrowByKeyBounds(current, afterKey(prefix)),
            );
            const { firstKey, selected } = yield* narrowByKeyBounds(self, {
              lower: Option.some({ orderKey: prefix, inclusive: true }),
              upper: Option.some({ orderKey: prefix, inclusive: true }),
            }).annotated.pipe(
              Stream.run(
                Sink.fold(
                  () => ({
                    firstKey:
                      Option.none<QueryStreamOrderKey.QueryStreamOrderKey>(),
                    selected: Option.none<Element<Doc>>(),
                  }),
                  (probe) => Option.isNone(probe.selected),
                  (probe, candidate: Element<Doc>) =>
                    Effect.succeed({
                      firstKey: Option.orElse(probe.firstKey, () =>
                        Option.some(candidate.orderKey),
                      ),
                      selected: Option.as(candidate.doc, candidate),
                    }),
                ),
              ),
            );
            if (Option.isSome(selected)) {
              const representative = selected.value;
              return Tuple.make(
                isAdmitted(representative.orderKey) ? [representative] : [],
                next,
              );
            }
            if (yield* budget.isStopped) return Tuple.make([], Option.none());
            const checkpoint = Option.getOrElse(firstKey, () => orderKey);
            return Tuple.make(
              isAdmitted(checkpoint)
                ? [
                    new Element({
                      doc: Option.none<Doc>(),
                      orderKey: checkpoint,
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
    order,
    self.keyLayout,
    annotated,
    undefined,
    (keyBounds) =>
      makeDistinct(
        self,
        distinctLength,
        order,
        Result.getOrThrowWith(
          QueryStreamKeyBounds.intersect(bounds, keyBounds),
          identity,
        ),
      ),
    () =>
      makeDistinct(
        self,
        distinctLength,
        QueryStreamOrderDirection.flip(order),
        bounds,
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
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
): QueryStream<Doc, Labels, Flip<Direction>, E, R> => {
  if (self.reverseWith === undefined) {
    throw new MissingReversalRecipeError();
  }
  return self.reverseWith();
};

/**
 * Restrict a stream to keys between `start` and `end`. Provide at least one
 * endpoint, each with an `orderKey` and a required `inclusive` flag; omit the
 * other endpoint to leave that side unbounded.
 *
 * Endpoints follow stream order: `start` is the lower key when ascending and
 * the upper key when descending. Repeated narrowing intersects existing bounds
 * and can only restrict the range further.
 *
 * A key may be a prefix of the full order key. An inclusive prefix includes
 * every key extending it; an exclusive prefix excludes the whole group. For
 * example, creation-time bounds can use `[startTime]` and `[endTime]` without
 * trailing IDs. Equal endpoints produce an empty range unless both are
 * inclusive, in which case they select that key or prefix group.
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
    bounds: NarrowBounds,
  ) => <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
  ) => QueryStream<Doc, Labels, Direction, E, R>,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    bounds: NarrowBounds,
  ) => QueryStream<Doc, Labels, Direction, E, R>
>(
  2,
  <
    Doc,
    Labels extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Labels, Direction, E, R>,
    bounds: NarrowBounds,
  ) => {
    const start = Option.fromUndefinedOr(bounds.start);
    const end = Option.fromUndefinedOr(bounds.end);
    // Stream space → ascending key space: for `desc`, "start" bounds from
    // above and "end" from below. Inclusion stays attached to its key.
    const keyBounds: KeyBounds =
      self.order === "asc"
        ? { lower: start, upper: end }
        : { lower: end, upper: start };
    return narrowByKeyBounds(self, keyBounds);
  },
);

const narrowByKeyBounds = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  bounds: KeyBounds,
): QueryStream<Doc, Labels, Direction, E, R> => {
  const parsed = Result.getOrThrowWith(
    QueryStreamKeyBounds.parse(self.keyLayout, bounds),
    identity,
  );
  return narrowByParsedBounds(self, parsed);
};

// Internal recipes share parsed bounds until their layout or coordinates change.
const narrowByParsedBounds = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  bounds: ParsedBounds,
): QueryStream<Doc, Labels, Direction, E, R> => {
  const unbounded = Option.isNone(bounds.lower) && Option.isNone(bounds.upper);
  if (!unbounded && self.narrowWith !== undefined)
    return self.narrowWith(bounds);
  // Recipe calls check their layout in the constructor's wrapper. No-op and
  // in-memory narrowing need the same check even without a recipe call.
  Result.getOrThrowWith(
    QueryStreamKeyBounds.forLayout(self.keyLayout, bounds),
    identity,
  );
  return unbounded ? self : narrowInMemory(self, bounds);
};

/**
 * The fallback for streams that don't know how to rebuild themselves.
 */
const keyPredicates = (bounds: ParsedBounds) => {
  const complete = (orderKey: QueryStreamOrderKey.QueryStreamOrderKey) =>
    Result.getOrThrowWith(
      QueryStreamKey.complete(bounds.layout, orderKey),
      identity,
    );
  return {
    aboveLower: (orderKey: QueryStreamOrderKey.QueryStreamOrderKey) =>
      Result.getOrThrowWith(
        QueryStreamKeyBounds.admittedByLower(bounds)(complete(orderKey)),
        identity,
      ),
    belowUpper: (orderKey: QueryStreamOrderKey.QueryStreamOrderKey) =>
      Result.getOrThrowWith(
        QueryStreamKeyBounds.admittedByUpper(bounds)(complete(orderKey)),
        identity,
      ),
  };
};

const narrowInMemory = <
  Doc,
  Labels extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Labels, Direction, E, R>,
  bounds: ParsedBounds,
): QueryStream<Doc, Labels, Direction, E, R> => {
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

  const { aboveLower, belowUpper } = keyPredicates(bounds);

  const dropOutOfRange: Narrower =
    self.order === "asc"
      ? Stream.dropWhile(({ orderKey }) => !aboveLower(orderKey))
      : Stream.dropWhile(({ orderKey }) => !belowUpper(orderKey));
  const takeInRange: Narrower =
    self.order === "asc"
      ? Stream.takeWhile(({ orderKey }) => belowUpper(orderKey))
      : Stream.takeWhile(({ orderKey }) => aboveLower(orderKey));

  return new QueryStream(
    self.order,
    self.keyLayout,
    pipe(self.annotated, dropOutOfRange, takeInRange),
    undefined,
    undefined,
    self.reverseWith === undefined
      ? undefined
      : () => narrowInMemory(reverse(self), bounds),
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
  <Doc, Labels extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Labels, OrderDirection, E, R>,
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
  ): <Doc, Labels extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Labels, OrderDirection, E, R>,
  ) => Effect.Effect<PaginationResult<Doc>, E | ReadBudgetExceededError, R>;
  <Doc, Labels extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Labels, OrderDirection, E, R>,
    options: PaginateOptions,
  ): Effect.Effect<PaginationResult<Doc>, E | ReadBudgetExceededError, R>;
} = dual(
  2,
  Effect.fn("QueryStream.paginate")(
    function* <
      Doc,
      Labels extends ReadonlyArray<string>,
      E,
      R,
      Direction extends OrderDirection,
    >(
      self: QueryStream<Doc, Labels, Direction, E, R>,
      options: PaginateOptions,
    ) {
      const cursorSchema = QueryStreamCursor.codecForLayout(self.keyLayout);
      const encodeCursor = Schema.encodeEffect(cursorSchema);
      const decodeCursor = Schema.decodeEffect(cursorSchema);
      const complete = (orderKey: QueryStreamOrderKey.QueryStreamOrderKey) =>
        Result.getOrThrowWith(
          QueryStreamKey.complete(self.keyLayout, orderKey),
          identity,
        );
      const decoded = yield* Effect.all({
        start: Option.match(Option.fromNullOr(options.cursor), {
          onNone: () => Effect.succeed(QueryStreamPagination.Start.Beginning()),
          onSome: (cursor) =>
            Effect.map(decodeCursor(cursor), (orderKey) =>
              QueryStreamPagination.Start.After({
                cursor,
                orderKey,
              }),
            ),
        }),
        range: Option.match(Option.fromNullishOr(options.endCursor), {
          onNone: () => Effect.succeed(QueryStreamPagination.Range.Unpinned()),
          onSome: (cursor) =>
            cursor === QueryStreamCursor.END_CURSOR
              ? Effect.succeed(QueryStreamPagination.Range.ThroughEnd())
              : Effect.map(decodeCursor(cursor), (orderKey) =>
                  QueryStreamPagination.Range.ThroughKey({
                    orderKey,
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
      const start = Option.map(request.after, (orderKey) => ({
        orderKey: QueryStreamKey.toPrefix(orderKey),
        inclusive: false,
      }));
      const end = QueryStreamPagination.Range.$match(request.range, {
        Unpinned: () => Option.none<ParsedBound>(),
        ThroughEnd: () => Option.none<ParsedBound>(),
        ThroughKey: ({ orderKey }) =>
          Option.some({
            orderKey: QueryStreamKey.toPrefix(orderKey),
            inclusive: true,
          }),
      });
      const narrowed = narrowByParsedBounds(
        self,
        Result.getOrThrowWith(
          QueryStreamKeyBounds.fromParsed(
            self.keyLayout,
            self.order === "asc"
              ? { lower: start, upper: end }
              : { lower: end, upper: start },
          ),
          identity,
        ),
      );
      const budget = yield* QueryStreamReadBudget.QueryStreamReadBudget;
      const collected = yield* Stream.run(
        narrowed.annotated,
        Sink.fold(
          () => QueryStreamPagination.initial<Doc>(),
          (state) => state._tag === "Reading",
          (state, { doc, orderKey }: Element<Doc>) =>
            Effect.map(budget.isExhausted, (hitLimit) =>
              QueryStreamPagination.record(
                request,
                state,
                doc,
                complete(orderKey),
                hitLimit,
              ),
            ),
        ),
      );
      const stopped = yield* budget.isStopped;
      const outcome = QueryStreamPagination.finish(request, collected, stopped);
      if (Result.isFailure(outcome)) {
        const counts = yield* budget.getReadCounts;
        return yield* new ReadBudgetExceededError(counts);
      }
      const encode = (orderKey: QueryStreamKey.Complete) =>
        encodeCursor(orderKey).pipe(Effect.catchTag("SchemaError", Effect.die));
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
              Key: ({ orderKey }) => encode(orderKey),
            }),
          );
          return {
            page: Array.fromIterable(result.page),
            isDone: false,
            continueCursor,
            pageStatus: result._tag,
            splitCursor: yield* encode(result.splitOrderKey),
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
          Continue: ({ page, orderKey }) =>
            Effect.map(
              encode(orderKey),
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
