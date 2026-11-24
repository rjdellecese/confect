/**
 * Experimental query streams for composing, joining, and paginating
 * standard-index reads. Start with `reader.table(handle).stream(index)`; use
 * `reader.table(handle).search(...)` for full-text search. Calling
 * `reader.table(handle).index(...).stream()` returns a plain Effect `Stream`,
 * not a query stream.
 *
 * A query stream orders documents by their stored index keys, not their mapped
 * values. An `eq` constraint removes the pinned field from the key; a range
 * bound keeps it. Creation time and document IDs break ties where applicable. A
 * stream's `keyLayout` describes the visible labels and implicit ID positions;
 * its `orderDirection` defaults to ascending.
 *
 * Building a stream does not read documents. Consuming it with
 * `Stream.runCollect`, `unique`, or `paginate` executes the query anew. Keep
 * callbacks deterministic and read-only: pagination, seeks, and reversal can
 * reevaluate them. Use this module's combinators to keep the ordering
 * information needed to merge and paginate.
 *
 * Return the whole `paginate` result from a handler. React's
 * `useStreamPaginatedQuery` pins and splits page ranges because Convex's query
 * journal does not track stream pages; `usePaginatedQuery` is for native
 * pagination. Foldkit's `PaginatedQuery` also supports stream pages. The
 * stream-query API may change.
 */
import type {
  PaginationOptions as ConvexPaginationOptions,
  PaginationResult as ConvexPaginationResult,
} from "convex/server";
import { ConvexError } from "convex/values";
import { identity, dual, pipe } from "effect/Function";
import * as Pipeable from "effect/Pipeable";
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
import type * as Table from "./Table";
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

const OrderDirection = Schema.Literals(["asc", "desc"]);

/**
 * Typed pagination failure when a valid read budget runs out before the page
 * can advance or split a pinned range at an interior key. Increase the budget
 * or reduce the underlying reads; retrying the same split alone cannot make
 * progress.
 *
 * @category Errors
 *
 * @experimental
 *
 * @see {@link paginate}
 */
export class ReadBudgetExceededError extends Schema.TaggedError<
  ReadBudgetExceededError,
  unknown
>()("ReadBudgetExceededError", {
  /**
   * Physical documents read, including filtered documents and repeated reads.
   *
   * @category Getters
   */
  rowsRead: Schema.Natural,
  /**
   * Estimated bytes charged across those reads, not Convex's billed bytes.
   *
   * @category Getters
   */
  bytesRead: Schema.Natural,
}) {
  /**
   * Returns a message explaining how to make progress after exhausting the
   * budget.
   *
   * @category Getters
   */
  override get message() {
    return "The read budget was exhausted before a safe page boundary; increase the budget or simplify the query";
  }
}

/**
 * Error thrown by `merge` during composition when inputs differ in direction,
 * visible key labels, or implicit ID positions. The first input supplies the
 * expected order and layout.
 *
 * @category Errors
 *
 * @experimental
 *
 * @see {@link merge}
 */
export class IncompatibleStreamsError extends Schema.TaggedError<
  IncompatibleStreamsError,
  unknown
>()("IncompatibleStreamsError", {
  /**
   * Direction of the first merge input, which defines the expected order.
   *
   * @category Getters
   */
  expectedOrderDirection: OrderDirection,
  /**
   * Direction of an incompatible merge input.
   *
   * @category Getters
   */
  actualOrderDirection: OrderDirection,
  /**
   * Layout of the first merge input, including implicit-ID positions.
   *
   * @category Getters
   */
  expectedKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  /**
   * Layout of an incompatible merge input.
   *
   * @category Getters
   */
  actualKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
}) {
  /**
   * Returns a message comparing the incompatible directions and key layouts.
   *
   * @category Getters
   */
  override get message(): string {
    return `QueryStream.merge: all streams must share an order and key layout (got ${this.expectedOrderDirection} ${QueryStreamKeyLayout.format(this.expectedKeyLayout)} and ${this.actualOrderDirection} ${QueryStreamKeyLayout.format(this.actualKeyLayout)})`;
  }
}

/**
 * Defect from running `flatMap` when an inner stream traverses its index in a
 * different direction from the outer stream. The payload identifies both
 * directions.
 *
 * @category Errors
 *
 * @experimental
 */
export class InnerStreamOrderMismatchError extends Schema.TaggedError<
  InnerStreamOrderMismatchError,
  unknown
>()("InnerStreamOrderMismatchError", {
  /**
   * Direction required by the outer stream.
   *
   * @category Getters
   */
  expectedOrderDirection: OrderDirection,
  /**
   * Direction returned by the inner-stream callback.
   *
   * @category Getters
   */
  actualOrderDirection: OrderDirection,
}) {
  /**
   * Returns a message comparing the inner and outer directions.
   *
   * @category Getters
   */
  override get message(): string {
    return `QueryStream.flatMap: inner stream order (${this.actualOrderDirection}) differs from the outer stream's (${this.expectedOrderDirection})`;
  }
}

/**
 * Defect from running `flatMap` when an inner stream's visible labels or
 * implicit ID positions differ from the `innerKeyLayout` template. The payload
 * identifies both layouts.
 *
 * @category Errors
 *
 * @experimental
 */
export class InnerStreamLayoutMismatchError extends Schema.TaggedError<
  InnerStreamLayoutMismatchError,
  unknown
>()("InnerStreamLayoutMismatchError", {
  /**
   * Layout supplied as flatMap's innerKeyLayout template.
   *
   * @category Getters
   */
  expectedKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  /**
   * Layout of the stream returned by the callback.
   *
   * @category Getters
   */
  actualKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
}) {
  /**
   * Returns a message comparing the inner layout with the required template.
   *
   * @category Getters
   */
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
 *
 * @internal
 */
export class MissingReversalRecipeError extends Schema.TaggedError<
  MissingReversalRecipeError,
  unknown
>()("MissingReversalRecipeError", {}) {
  override get message(): string {
    return "QueryStream.reverse: this stream cannot be reversed without a reversal recipe";
  }
}

/**
 * Defects from `paginate` for an invalid page size or an initial request that
 * cannot establish a cursor.
 *
 * @category Errors
 *
 * @public
 *
 * @experimental
 */
export {
  /**
   * Defect from requesting `numItems: 0` with `cursor: null`. Request a
   * positive size to establish the first continuation boundary; a resumed page
   * can use zero.
   *
   * @category Errors
   *
   * @public
   */
  EmptyInitialPageError,
  /**
   * Defect from requesting a page size that is not a nonnegative integer. The
   * `numItems` payload records the rejected number.
   *
   * @category Errors
   *
   * @public
   */
  InvalidPageSizeError,
} from "./QueryStreamPagination";

/**
 * Defect from `paginate` when `maximumRowsRead` or `maximumBytesRead` is not a
 * nonnegative integer. The `cause` is the `SchemaError` identifying the invalid
 * limit. A valid budget that cannot support safe progress produces a typed
 * `ReadBudgetExceededError` instead.
 *
 * @category Errors
 *
 * @public
 *
 * @experimental
 *
 * @see {@link ReadBudgetExceededError}
 */
export { InvalidReadLimitError } from "./QueryStreamReadBudget";

/**
 * Runtime identifier used to distinguish query streams from plain streams.
 *
 * @experimental
 *
 * @internal
 */
export const TypeId = "~@confect/server/QueryStream";
/**
 * Type of the query stream's runtime identifier.
 *
 * @experimental
 *
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * A decoded value and its stored key. `doc: None` marks an element that was
 * read but filtered out: it emits no value, but still advances cursors. Mapping
 * a value does not recompute its key.
 *
 * @experimental
 *
 * @internal
 */
export class Element<Doc> extends Data.Class<{
  readonly doc: Option.Option<Doc>;
  readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
}> {}

// -----------------------------------------------------------------------------
// QueryStream
// -----------------------------------------------------------------------------

/**
 * An Effect `Stream` that retains its index keys for ordered merges and
 * pagination, independently of the values it emits. Start with the table
 * reader's `stream` method; TypeScript infers the document type and ordering
 * from the table and index range.
 *
 * **Details**
 *
 * - `Doc` is the decoded document or the output of a mapping or join.
 * - `KeyLabels` is the tuple of visible ordering names. It omits fields pinned by
 *   `eq` and implicit document IDs. `keyLayout` retains the positions of those
 *   IDs; reuse it with `empty` or as `flatMap`'s `innerKeyLayout`.
 * - `OrderDirection` is `"asc"` or `"desc"`. Merge requires matching directions
 *   and layouts, including implicit ID positions.
 * - `E` contains typed read or callback failures. `never` does not rule out
 *   defects.
 * - `R` contains the services needed to run callbacks. The stream retains the
 *   database access supplied at creation.
 *
 * **Gotchas**
 *
 * Effect consumers such as `Stream.runHead` can read a query stream directly.
 * Plain transforms such as `Stream.take` return ordinary streams, so you cannot
 * merge or paginate their results with this module.
 *
 * @category Models
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
  /**
   * @internal
   */
  declare readonly [TypeId]: TypeId;
  /**
   * @internal
   */
  declare readonly "~labels": Types.Invariant<KeyLabels>;
  /**
   * @internal
   */
  declare readonly "~direction": Types.Covariant<OrderDirection>;

  // The `Stream` protocol (the variance marker, `pipe`, and the `channel`
  // the Stream runtime consumes) is implemented directly: the members are
  // `declare`d with their real types here and wired up on the prototype
  // below, so type-parameter inference over `QueryStream` values stays
  // intact for every `Stream.*` combinator.
  /**
   * @internal
   */
  declare readonly [Stream.TypeId]: Stream.VarianceStruct<Doc, E, R>;
  /**
   * Applies functions from left to right. Use query-stream combinators to
   * retain ordered merging and pagination; a plain Effect `Stream` transform
   * discards the query-stream metadata.
   *
   * @category Combinators
   */
  declare readonly pipe: Pipeable.Pipeable["pipe"];
  /**
   * @internal
   */
  declare readonly channel: Channel.Channel<
    Array.NonEmptyReadonlyArray<Doc>,
    E,
    void,
    unknown,
    unknown,
    unknown,
    R
  >;

  /**
   * @internal
   */
  constructor(
    /**
     * Traversal direction, `"asc"` or `"desc"`. Reversal flips the direction
     * without changing the key layout.
     *
     * @category Getters
     *
     * @public
     */
    readonly orderDirection: OrderDirection,
    /**
     * Layout of the stream's visible key labels and implicit ID positions.
     * Reuse it with `empty` or `flatMap`'s `innerKeyLayout` without reading
     * documents. Direction is stored separately in `orderDirection`.
     *
     * @category Getters
     *
     * @public
     */
    readonly keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
    /**
     * Values paired with stored keys, including filtered markers that advance
     * cursors without emitting a value.
     *
     * @internal
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
     *
     * @internal
     */
    readonly reflection?: Reflection,
    /**
     * Rebuilds the stream with validated key bounds, pushing them into index
     * ranges where that preserves the composition's results. Without this
     * recipe, `narrow` filters the annotated stream in memory. The constructor
     * guards recipe calls against bounds from incompatible layouts.
     *
     * @internal
     */
    readonly narrowWith?: (
      parsedBounds: QueryStreamKeyBounds.ParsedBounds,
    ) => QueryStream<Doc, KeyLabels, OrderDirection, E, R>,
    /**
     * Rebuilds the stream in the opposite direction using index scans and
     * seeks. Distinct streams keep their original representatives. Without this
     * recipe, `reverse` throws `MissingReversalRecipeError`.
     *
     * @internal
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

  /**
   * @internal
   */
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
    value: Object.getOwnPropertyDescriptors(Pipeable.Prototype).pipe.value,
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
 *
 * @internal
 */
export type Any = QueryStream<any, any, any, any, any>; // oxlint-disable-line typescript/no-explicit-any -- The exported guard exposes the full stream at every instantiation, including invariant key-label tuples.

/**
 * Checks whether a value is a query stream without reading any documents. An
 * ordinary Effect `Stream`, including the result of a plain stream transform,
 * does not pass the check.
 *
 * @category Guards
 *
 * @param u - Unknown value to test without consuming it.
 *
 * @returns Whether the value carries the QueryStream brand; narrows its type.
 *
 * @experimental
 */
export const isQueryStream = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * Creates an empty query stream with the supplied key layout and direction.
 * Supply the document type in the first call, then pass a compatible stream's
 * layout: `empty<NotesDoc>()(source.keyLayout, "desc")`. The default direction
 * is ascending.
 *
 * **When to use**
 *
 * Use when a dynamic list of index ranges has no entries but the caller still
 * needs a stream it can merge or paginate. Reading a source's layout does not
 * execute the query.
 *
 * @category Constructors
 *
 * @returns A constructor accepting a layout and optional direction. The
 *   resulting stream emits nothing and has no typed failures or service
 *   requirements.
 *
 * @experimental
 */
export const empty = <Doc>() => {
  const annotated: Stream.Stream<Element<Doc>> = Stream.empty;
  function make<
    const KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  >(
    keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
  ): QueryStream<Doc, KeyLabels, "asc", never, never>;
  function make<
    const KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
    OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection,
  >(
    keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
    orderDirection: OrderDirection,
  ): QueryStream<Doc, KeyLabels, OrderDirection, never, never>;
  function make<KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels>(
    keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<KeyLabels>,
    orderDirection: QueryStreamOrderDirection.QueryStreamOrderDirection = "asc",
  ) {
    return new QueryStream(
      orderDirection,
      keyLayout,
      annotated,
      undefined,
      () => make(keyLayout, orderDirection),
      () => make(keyLayout, QueryStreamOrderDirection.flip(orderDirection)),
    );
  }
  return make;
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
 *
 * @internal
 */
export interface ReflectionReader {
  query(tableName: string): {
    withIndex(
      indexName: string,
      // oxlint-disable-next-line typescript/no-explicit-any -- Reflection readers can supply their own builder and consume its result; neither is required to be a nominal Convex IndexRange.
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
 *
 * @internal
 */
export interface Reflection<
  OrderDirection extends QueryStreamOrderDirection.QueryStreamOrderDirection =
    QueryStreamOrderDirection.QueryStreamOrderDirection,
> {
  readonly reader: ReflectionReader;
  readonly table: Table.AnyWithProps;
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
 *
 * @internal
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
      Stream.suspend(() => {
        const table: Table.Any = reflection.table;
        return Stream.fromAsyncIterable(
          reflection.reader
            .query(table.tableName)
            .withIndex(
              reflection.indexName,
              QueryStreamIndexRange.apply.bind(undefined, indexRange),
            )
            .order(reflection.orderDirection),
          identity,
        ).pipe(Stream.orDie);
      }),
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
        Document.decode(reflection.table)(encoded),
        (doc) =>
          new Element({
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromReflection exposes a caller-selected Doc; the retained table codec has decoded it but erases its output type.
            doc: Option.some(doc as Doc),
            keyValues: QueryStreamKeyValues.extract(
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The budget service yields unknown; this encoded row has already passed the table's document decoder.
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
  Exhausted: Record<never, never>;
  BudgetLimited: Record<never, never>;
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
      if (
        Array.some(filled, (source) => MergeSource.$is("BudgetLimited")(source))
      ) {
        return undefined;
      }
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
 * Merges a nonempty tuple of query streams by their stored keys, emitting the
 * smallest next key in ascending order or the largest in descending order. The
 * order does not depend on when reads complete.
 *
 * **When to use**
 *
 * Use to query several index ranges as one feed, for example notes written by
 * any of several roles.
 *
 * **Gotchas**
 *
 * - Overlapping inputs emit duplicate matches. If a page ends between two
 *   occurrences of the same key, its exclusive continuation skips the remaining
 *   occurrence. Use disjoint ranges when every match must survive pagination.
 * - Inputs must agree on direction, visible labels, and implicit ID positions; an
 *   unchecked mismatch throws at composition time. Map differing document types
 *   to a common shape and use `renameKey` only for fields whose values have
 *   comparable meaning. For an empty list, return an `empty` stream instead.
 *
 * @category Merging
 *
 * @param streams - Nonempty tuple of streams with compatible values, labels,
 *   implicit-ID positions, and direction.
 *
 * @returns A lazy ordered stream retaining the inputs' error and service types.
 *
 * @throws IncompatibleStreamsError if runtime layouts or directions differ.
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
    throw IncompatibleStreamsError.make({
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
      Effect.forEach(streams, (stream) => Stream.toPull(stream.annotated), {
        concurrency: 1,
      }),
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
 * Concurrency options for the effectful callbacks in `filterEffect` and
 * `mapEffect`. Concurrency changes when reads run, not the stream's output
 * order.
 *
 * @category Configuration
 *
 * @experimental
 */
export interface EffectOptions {
  /**
   * Maximum number of document effects running at once, or `"unbounded"`.
   * Defaults to one at a time. Results retain stream order regardless of
   * completion order; callbacks must remain deterministic and read-only.
   *
   * @category Configuration
   */
  readonly concurrency?: number | "unbounded" | undefined;
}

/**
 * Keeps documents that satisfy a pure predicate while preserving their stored
 * keys for merging and pagination.
 *
 * **Gotchas**
 *
 * Rejected documents still count as reads and advance cursors. Filtering before
 * `distinct` selects each group's first matching document; filtering afterward
 * tests only the chosen representative.
 *
 * @category Filtering
 *
 * @param self - Input query stream in the data-first form.
 * @param predicate - Pure, deterministic test of each emitted document.
 *
 * @returns A query stream, or a pipeable function when only the predicate is
 *   supplied; rejected documents do not change the stream's key layout.
 *
 * @experimental
 *
 * @see {@link filterEffect} for a predicate that reads another table or uses a service.
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
 * Keeps documents that satisfy an effectful predicate. The resulting stream
 * preserves the original keys and order and requires any services used by the
 * predicate.
 *
 * **Details**
 *
 * Callbacks run one at a time by default. Set `concurrency` to overlap
 * independent reads without changing output order.
 *
 * **Gotchas**
 *
 * Keep the predicate deterministic and read-only: seeks and pagination can run
 * it again. Separate database lookups inside the callback do not count toward
 * the stream's pagination budget.
 *
 * @category Filtering
 *
 * @param self - Input query stream in the data-first form.
 * @param predicate - Read-only effectful test of each emitted document.
 * @param options - Optional callback concurrency; output order is preserved.
 *
 * @returns A filtered query stream (or pipeable function) whose error and
 *   service requirements include those of the predicate.
 *
 * @experimental
 *
 * @see {@link filter} for a pure predicate.
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
 * Maps emitted values with a pure function while retaining the original keys
 * for merging and pagination.
 *
 * **Gotchas**
 *
 * Changing an indexed field does not re-sort the stream. For example, mapping
 * text to its length still orders by the original index key, not by length.
 * Return a new value rather than mutating the input.
 *
 * @category Mapping
 *
 * @param self - Input query stream in the data-first form.
 * @param f - Pure, deterministic function from a decoded value to its
 *   replacement.
 *
 * @returns A mapped query stream, or a pipeable function when only f is
 *   supplied. Keys, ordering, error types, and service requirements remain
 *   unchanged.
 *
 * @experimental
 *
 * @see {@link mapEffect} for a mapper that performs an effect.
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
 * Maps each emitted value with an effect, retaining the original index keys and
 * output order. The stream inherits any errors or service requirements of the
 * mapper.
 *
 * **Details**
 *
 * Callbacks run one at a time by default. Set `concurrency` to overlap
 * independent reads without changing output order.
 *
 * **Gotchas**
 *
 * Keep the mapper deterministic and read-only: seeks, reversal, and pagination
 * can run it again. Separate database lookups inside the callback do not count
 * toward the stream's pagination budget.
 *
 * @category Mapping
 *
 * @param self - Input query stream in the data-first form.
 * @param f - Read-only effect producing each replacement value.
 * @param options - Optional callback concurrency; output order is preserved.
 *
 * @returns A mapped query stream (or pipeable function), adding the mapper's
 *   error and service types while preserving stored keys.
 *
 * @experimental
 *
 * @see {@link map} for a pure mapper.
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
 * Joins each outer document to an inner query stream and emits the inner
 * results before advancing to the next outer document. Joined keys concatenate
 * the outer and inner keys, including their ID tiebreakers.
 *
 * **Details**
 *
 * Supply a compatible stream's `keyLayout` as `innerKeyLayout` so the joined
 * key is known even when the outer stream is empty. Creating this template does
 * not read documents. For a nested join or a renamed stream, apply the same
 * composition or renaming to the template.
 *
 * An empty inner stream normally emits nothing but advances the cursor past its
 * outer document. Supply `onEmpty` to emit a placeholder keyed by the outer key
 * followed by null inner components. An outer document filtered out before the
 * join remains absent.
 *
 * **Gotchas**
 *
 * Every inner stream must match both the template layout and the outer
 * direction. A mismatch dies with `InnerStreamLayoutMismatchError` or
 * `InnerStreamOrderMismatchError` when the join runs. Pagination, narrowing,
 * and reversal can rerun `f` and `onEmpty`, so keep both deterministic and
 * read-only. Both outer and inner index reads count toward pagination budgets.
 *
 * @category Sequencing
 *
 * @param self - Outer query stream in the data-first form.
 * @param f - Deterministic callback returning an inner QueryStream per outer
 *   value.
 * @param options - Required innerKeyLayout template and optional onEmpty
 *   callback.
 *
 * @returns A query stream (or pipeable function) with concatenated outer/inner
 *   keys and the union of their errors and requirements. onEmpty adds its
 *   return type to the emitted values; layout/direction mismatches are
 *   defects.
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
      /**
       * Layout template shared by every inner stream, including implicit IDs.
       *
       * @category Configuration
       */
      readonly innerKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<
        NoInfer<InnerKeyLabels>
      >;
      /**
       * Creates the placeholder to emit when this outer document has no inner
       * values. The callback must be deterministic.
       *
       * @category Configuration
       */
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
      /**
       * Layout template shared by every inner stream, including implicit IDs.
       *
       * @category Configuration
       */
      readonly innerKeyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout<
        NoInfer<InnerKeyLabels>
      >;
      /**
       * Creates the placeholder to emit when this outer document has no inner
       * values. The callback must be deterministic.
       *
       * @category Configuration
       */
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => QueryStream<
    Doc2 | Doc3,
    QueryStreamKeyLabels.Concat<KeyLabels, InnerKeyLabels>,
    OrderDirection,
    E | E2,
    R | R2
  >
>(3, (self, f, options): Any =>
  makeFlatMap(
    self,
    f,
    options.innerKeyLayout,
    Option.fromUndefinedOr(options.onEmpty),
    { lower: Option.none(), upper: Option.none() },
  ),
);

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

const outerBound = (bound: FlatMapBound): QueryStreamKeyBounds.KeyBound =>
  FlatMapBound.$match(bound, {
    Outer: ({ keyValues, inclusive }) => ({ keyValues, inclusive }),
    Inner: ({ outerKeyValues }) => ({
      keyValues: outerKeyValues,
      inclusive: true,
    }),
  });

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
   *
   * @category Options
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
      throw InnerStreamOrderMismatchError.make({
        expectedOrderDirection: self.orderDirection,
        actualOrderDirection: inner.orderDirection,
      });
    }
    if (!QueryStreamKeyLayout.Equivalence(inner.keyLayout, innerKeyLayout)) {
      throw InnerStreamLayoutMismatchError.make({
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
                  if (yield* readBudget.isStopped) {
                    return Stream.empty;
                  }
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
    const keyValues = QueryStreamKey.values(bound.key);
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
 * Keeps the first emitted document for each distinct value of a key prefix,
 * seeking past the rest of each group. Pass leading visible labels in order,
 * such as `["text"]` for an index on text followed by creation time.
 *
 * **Details**
 *
 * On a `flatMap` result, a prefix reaching into the inner key includes the
 * outer document ID, so it groups within each outer document.
 *
 * **Gotchas**
 *
 * Filter or narrow before `distinct` to control which document represents each
 * group. Filtering or narrowing afterward tests the original representatives
 * without choosing replacements. Likewise, `reverse(distinct(q))` keeps the
 * representatives, while `distinct(reverse(q))` chooses from the other
 * direction. Preserving representatives can require extra reads outside the
 * output bounds and repeated callbacks.
 *
 * @category Filtering
 *
 * @param self - Input query stream in the data-first form.
 * @param prefixNames - Prefix of visible labels, in order, used to group keys.
 *
 * @returns A query stream (or pipeable function) retaining the first emitted
 *   value per group and the input's layout and direction. An invalid prefix
 *   throws during composition rather than becoming a typed stream failure.
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
>(2, (self, prefixNames) =>
  // Groups are runs of equal *runtime* prefixes, so a prefix that reaches
  // past a tiebreaker (into a `flatMap` result's inner key) includes it.
  makeDistinct(
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
  ),
);

/**
 * Renames the visible key positions without changing the emitted documents,
 * stored key values, traversal order, or positions of implicit IDs.
 *
 * **When to use**
 *
 * Use to merge indexes that order comparable values under different field
 * names. For example, rename `body` to `text` in a comments index before
 * merging it with a notes index ordered by text; map their document types to a
 * common shape.
 *
 * **Gotchas**
 *
 * Supply one name per visible position, outer labels first for a joined stream.
 * Matching names do not make the underlying values semantically comparable.
 *
 * @category Ordering
 *
 * @param self - Input query stream in the data-first form.
 * @param replacementNames - One new name for each visible label, in order.
 *
 * @returns A query stream (or pipeable function) with new label types and
 *   layout, but the same stored values, direction, errors, and service
 *   requirements. A label-count mismatch throws during composition.
 *
 * @experimental
 *
 * @see {@link merge} to combine streams after aligning their keys.
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
      keyValues: Array.take(QueryStreamKey.values(key), distinctLength),
      inclusive:
        QueryStreamKey.values(key).length > distinctLength || inclusive,
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
            if (yield* readBudget.isStopped) {
              return Tuple.make([], Option.none());
            }
            const discovered = yield* Stream.runHead(current.annotated);
            if (Option.isNone(discovered)) {
              return Tuple.make([], Option.none());
            }
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
            if (yield* readBudget.isStopped) {
              return Tuple.make([], Option.none());
            }
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
 * Reverses traversal of the query stream with index scans and seeks rather than
 * collecting and reversing the emitted values. The key layout stays unchanged.
 *
 * **When to use**
 *
 * Use to read in the opposite direction, for example to load earlier pages of a
 * feed.
 *
 * **Gotchas**
 *
 * Reversing a `distinct` stream preserves each group's original representative
 * and may need extra reads to find it. Applying `distinct` after reversal
 * instead selects the first document from the other direction. Streams from the
 * table reader and this module's combinators support reversal; manually
 * constructed streams without a reversal recipe throw
 * `MissingReversalRecipeError`.
 *
 * @category Ordering
 *
 * @param self - Query stream created by the table reader or these combinators.
 *
 * @returns A query stream with the opposite direction and unchanged emitted
 *   type, layout, typed failures, and service requirements.
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
    throw MissingReversalRecipeError.make({});
  }
  return self.reverseWith();
};

/**
 * Restricts the stream to keys between a start and an end in traversal order.
 * Supply either or both bounds and specify `inclusive` for each one. Repeated
 * narrowing intersects the bounds.
 *
 * **Details**
 *
 * `start` is the lower key for ascending streams and the upper key for
 * descending streams. A prefix such as `[startTime]` includes or excludes the
 * whole group of keys extending it. Equal endpoints select that key or prefix
 * group only when both are inclusive.
 *
 * **Gotchas**
 *
 * Narrowing after `distinct` tests the original representatives, which may
 * require reads outside the output bounds. Narrow first to change which
 * documents can represent a group. For pagination, pass the previous
 * `continueCursor` unchanged to `paginate` rather than decoding it into
 * bounds.
 *
 * @category Filtering
 *
 * @param self - Input query stream in the data-first form.
 * @param narrowBounds - At least one of start/end; each contains keyValues and
 *   inclusive. Include intervening implicit IDs when specifying complete keys.
 *
 * @returns A query stream (or pipeable function) with intersected bounds and
 *   the same value, ordering, error, and service types. Invalid key widths
 *   throw during composition, not through the typed stream error channel.
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
  if (!unbounded && self.narrowWith !== undefined) {
    return self.narrowWith(parsedBounds);
  }
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
 * Typed failure from `unique` when the stream emits more than one value. Narrow
 * the query if at most one match is expected, or choose a consumer that accepts
 * multiple results.
 *
 * @category Errors
 *
 * @experimental
 */
export class NotUniqueError extends Schema.TaggedError<
  NotUniqueError,
  unknown
>()("NotUniqueError", {}) {
  /**
   * Returns a message explaining the at-most-one expectation.
   *
   * @category Getters
   */
  override get message(): string {
    return "Expected the query stream to contain at most one document";
  }
}

/**
 * Reads up to two emitted values to check uniqueness. Returns `None` for no
 * match or `Some(value)` for one, and fails with `NotUniqueError` for two.
 * Finding those values may require reading additional filtered documents.
 *
 * @category Running
 *
 * @param self - Query stream expected to emit at most one value.
 *
 * @returns An effect yielding an `Option`, retaining the stream's failures and
 *   services and adding `NotUniqueError`.
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
          ? Effect.fail(NotUniqueError.make({}))
          : Effect.succeed(Array.head(docs)),
      ),
    ),
);

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

/**
 * Convex pagination options for reading a query stream by its stored keys. Pass
 * a paginated query handler's `paginationOpts` directly to `paginate`.
 *
 * **Details**
 *
 * - `cursor` is an exclusive start boundary; `null` starts at the beginning.
 * - `numItems` requests a number of emitted values, excluding filtered documents.
 *   When `endCursor` pins a range, this size informs split recommendations
 *   rather than limiting results.
 * - `endCursor` is an optional inclusive boundary from a previous page. It pins
 *   the page to the same key range even if the number of values changes.
 * - `maximumRowsRead` limits physical index reads, including filtered documents
 *   and repeated reads.
 * - `maximumBytesRead` limits estimated document bytes, not Convex's exact billed
 *   bytes. The last document can take the total over the limit because its size
 *   is known only after the read.
 *
 * **Gotchas**
 *
 * With `numItems: 0`, a valid continuation cursor is returned unchanged with an
 * empty page and `isDone: false`. A null cursor dies with
 * `EmptyInitialPageError`.
 *
 * @category Configuration
 *
 * @experimental
 */
export type PaginateOptions = ConvexPaginationOptions;

/**
 * One query-stream page in Convex's pagination result shape. Return the whole
 * result to a reactive client so it can pin and split loaded pages; a one-shot
 * consumer can use `page` alone.
 *
 * **Details**
 *
 * - `page` contains emitted values. It can be empty even when the scan progressed
 *   past filtered keys.
 * - `continueCursor` is the next page's exclusive start. Pass it back unchanged
 *   as `cursor` while `isDone` is false.
 * - `splitCursor` divides a range. Use it as the left page's inclusive
 *   `endCursor` and the right page's exclusive `cursor`, retaining the original
 *   end on the right.
 * - `pageStatus` is `"SplitRequired"` when a read budget stops a page at a safe
 *   boundary, or `"SplitRecommended"` when a pinned page grows large or a scan
 *   covers many keys. Both statuses include a `splitCursor`.
 * - `isDone: true` confirms the end of the stream, not just a pinned boundary. A
 *   split recommendation can still report false at the end; handle splitting
 *   before requesting another page.
 *
 * @category Models
 *
 * @experimental
 */
export type PaginationResult<Doc> = ConvexPaginationResult<Doc>;

/**
 * Reads a page of emitted values from a composed query stream. Start with
 * `cursor: null`, then pass each returned `continueCursor` back unchanged. A
 * cursor marks a key boundary, so filtering can advance it without emitting a
 * document.
 *
 * **Details**
 *
 * Without an end boundary, `numItems` limits emitted values. With `endCursor`,
 * the page covers the range after `cursor` through that inclusive end, even as
 * the number of matching documents changes. Return the whole result to reactive
 * clients. React's `useStreamPaginatedQuery` handles pinned ranges, splitting,
 * and invalid-cursor resets; `usePaginatedQuery` does not support stream pages.
 * Foldkit's `PaginatedQuery` also supports them.
 *
 * Budgets count underlying index reads, including filtered rows, repeated
 * seeks, merge prefetch, and both sides of a join. They do not count separate
 * lookups in callbacks. A budget-limited page requests a split at a safe
 * boundary. If it cannot advance safely or split a pinned range at an interior
 * key, the effect fails with `ReadBudgetExceededError`; increase the budget or
 * reduce the reads needed for progress.
 *
 * **Gotchas**
 *
 * - Malformed cursors or cursors incompatible with the key layout die with a
 *   `ConvexError` carrying `{ paginationError: "InvalidCursor" }`. Restart
 *   pagination after changing the filters, ordering, or other semantics even
 *   when the old cursor is accepted.
 * - Cursors are unsigned and expose key labels and values, including document
 *   IDs. Do not paginate over sensitive indexed values that remain in the key.
 *   Pass cursors back unchanged rather than constructing them from documents or
 *   decoding them into bounds.
 * - Invalid `numItems` dies with `InvalidPageSizeError`; a zero-sized initial
 *   page dies with `EmptyInitialPageError`. Invalid read limits die with
 *   `InvalidReadLimitError`. These are defects rather than typed budget
 *   failures.
 *
 * @category Pagination
 *
 * @param self - Query stream in the data-first form.
 * @param options - Pagination boundaries, requested size, and optional read
 *   budgets.
 *
 * @returns An effect yielding the pagination result, or a pipeable function
 *   when only options are supplied. The effect retains the stream's failures
 *   and service requirements and adds `ReadBudgetExceededError` as a typed
 *   failure.
 *
 * @experimental
 *
 * @see {@link PaginateOptions} for cursor boundaries and read limits.
 * @see {@link PaginationResult} for handling split and completion signals.
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
      const complete = (keyValues: QueryStreamKeyValues.QueryStreamKeyValues) =>
        Result.getOrThrowWith(
          QueryStreamKey.complete(self.keyLayout, keyValues),
          identity,
        );
      const decoded = yield* Effect.all(
        {
          start: Option.match(Option.fromNullOr(options.cursor), {
            onNone: () =>
              Effect.succeed(QueryStreamPagination.Start.Beginning()),
            onSome: (cursor) =>
              Effect.map(Schema.decodeEffect(cursorSchema)(cursor), (key) =>
                QueryStreamPagination.Start.After({
                  cursor,
                  key,
                }),
              ),
          }),
          range: Option.match(Option.fromNullishOr(options.endCursor), {
            onNone: () =>
              Effect.succeed(QueryStreamPagination.Range.Unpinned()),
            onSome: (cursor) =>
              cursor === QueryStreamCursor.END_CURSOR
                ? Effect.succeed(QueryStreamPagination.Range.ThroughEnd())
                : Effect.map(Schema.decodeEffect(cursorSchema)(cursor), (key) =>
                    QueryStreamPagination.Range.ThroughKey({
                      key,
                    }),
                  ),
          }),
        },
        { concurrency: 1 },
      ).pipe(
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
        return yield* ReadBudgetExceededError.make(counts);
      }
      const encode = (key: QueryStreamKey.Complete) =>
        Schema.encodeEffect(cursorSchema)(key).pipe(
          Effect.catchTag("SchemaError", Effect.die),
        );
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
              QueryStreamReadBudget.InvalidReadLimitError.make({ cause }),
            ),
          ),
          Effect.flatMap(QueryStreamReadBudget.make),
        ),
      ),
  ),
);
