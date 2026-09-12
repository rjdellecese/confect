/**
 * EXPERIMENTAL—a stream-first querying API for Confect.
 *
 * A `QueryStream` is a genuine Effect `Stream` of decoded documents, ordered
 * by indexed fields, that additionally remembers:
 *
 * - its **order key** at the type level (the index fields that still vary
 *   after equality pinning), so that `merge` can reject incompatible streams
 *   at compile time, and
 * - each element's **order key values** at runtime (including read-but-
 *   filtered-out elements), so that `paginate` works over arbitrary
 *   compositions of `merge`/`filterEffect`/`mapEffect`.
 *
 * This is the Effect-native formulation of `convex-helpers/server/stream`'s
 * `QueryStream`; see `notes/stream-based-querying.md` for the design.
 *
 * Each operation's doc gives its SQL analogy: a query stream is an ordered
 * result set—`SELECT * FROM table ORDER BY <index fields>`—and each
 * operation is a clause around it.
 *
 * Known limitations (all called out in the design doc):
 *
 * - `maximumBytesRead` charges each document's estimated size (Convex's
 *   `getDocumentSize`), as `convex-helpers` does—not the exact bytes the
 *   backend bills; NaN ordering subtleties are skipped.
 * - Cursors serialize only the *remaining* (order-key) fields, not the full
 *   index key—equality-pinned values never leak into cursors.
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
import * as QueryStreamKeyFields from "./QueryStreamKeyFields";
import type { Names as KeyFields } from "./QueryStreamKeyFields";
import * as QueryStreamOrderDirection from "./QueryStreamOrderDirection";
import type {
  QueryStreamOrderDirection as OrderDirection,
  Flip,
} from "./QueryStreamOrderDirection";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";
import type { QueryStreamOrderKey as OrderKey } from "./QueryStreamOrderKey";
import * as QueryStreamKeyBounds from "./QueryStreamKeyBounds";
import type {
  KeyBound,
  KeyBounds,
  IndexBounds,
  NarrowBounds,
} from "./QueryStreamKeyBounds";
import * as QueryStreamIndexRange from "./QueryStreamIndexRange";
import type { AnyIndexRangeSpec } from "./QueryStreamIndexRange";
import * as QueryStreamReadBudget from "./QueryStreamReadBudget";

/**
 * @experimental
 */
export const TypeId = "~@confect/server/QueryStream";
/**
 * @experimental
 */
export type TypeId = typeof TypeId;

/**
 * An element of the annotated stream: the decoded document (`None` when the
 * element was read but filtered out—it still advances cursors) paired with
 * its order key.
 *
 * @experimental
 */
export class Element<Doc> extends Data.Class<{
  readonly doc: Option.Option<Doc>;
  readonly key: OrderKey;
}> {}

// -----------------------------------------------------------------------------
// QueryStream
// -----------------------------------------------------------------------------

/**
 * An Effect `Stream` of decoded documents in index order, carrying the order
 * key of each element so compositions stay mergeable and paginable.
 *
 * `Key` is the type-level order-key witness: the index fields that still
 * vary. Streams with different `Key`s cannot be merged (a type error), and
 * applying a generic `Stream` combinator degrades a `QueryStream` to a plain
 * `Stream`—which is honest: generic combinators can't maintain cursor
 * accounting, so the result is consumable but no longer paginable.
 *
 * @experimental
 */
export class QueryStream<
  out Doc,
  Key extends KeyFields = KeyFields,
  out Direction extends OrderDirection = OrderDirection,
  out E = never,
  out R = never,
> implements Stream.Stream<Doc, E, R> {
  declare readonly [TypeId]: TypeId;
  declare readonly "~key": Types.Invariant<Key>;
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
    readonly keyLayout: QueryStreamKeyFields.QueryStreamKeyFields,
    /** The annotated elements; `None` = read but filtered out. */
    readonly annotated: Stream.Stream<Element<Doc>, E, R>,
    /**
     * Present on leaf streams only: the recipe this stream's underlying
     * Convex query is (re)built from on every run, with its effective
     * `bounds`. Derived streams (`merge`, `filterEffect`, …) don't carry
     * one—they narrow via `narrowWith` instead.
     */
    readonly reflection?: Reflection,
    /**
     * How this stream narrows itself to tighter order-key bounds: leaves
     * rebuild their Convex queries with the bounds pushed into `withIndex`
     * ranges, and derived streams narrow their inputs and re-apply their
     * combinator. Absent (e.g. on externally constructed streams), `narrow`
     * falls back to filtering the annotated stream in memory.
     */
    readonly narrowWith?: (
      bounds: KeyBounds,
    ) => QueryStream<Doc, Key, Direction, E, R>,
    /**
     * How this stream runs in the opposite direction: leaves rebuild their
     * Convex queries with the other `order`, and derived streams reverse
     * their inputs and re-apply their combinator. Distinct streams retain
     * their representative-selection order. Absent on externally
     * constructed streams without a reversal recipe; `reverse` then throws.
     */
    readonly reverseWith?: () => QueryStream<Doc, Key, Flip<Direction>, E, R>,
  ) {}

  get keyFields(): KeyFields {
    return QueryStreamKeyFields.names(this.keyLayout);
  }

  toStream(): Stream.Stream<Doc, E, R> {
    return Stream.filterMap(
      this.annotated,
      Filter.fromPredicateOption(({ doc }) => doc),
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
 * @experimental
 */
export type Any = QueryStream<any, any, any, any, any>;

/**
 * Whether `u` is a `QueryStream`—as opposed to the plain `Stream` that a
 * generic `Stream.*` combinator turns one into (in SQL terms: whether the
 * value still knows its `ORDER BY`, and so can still be combined and
 * paginated).
 *
 * @experimental
 */
export const isQueryStream = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * An empty query stream with the given order key and direction—the
 * `merge` input for a dynamic list of streams that may turn out empty.
 *
 * In SQL terms: the empty relation—`SELECT ... WHERE false` with the same
 * `ORDER BY`—so it merges with, and paginates like, any stream of that
 * key.
 *
 * Nothing can infer the document type from no documents, so it is supplied
 * as a type argument in a first, otherwise empty call:
 * `QueryStream.empty<NotesDoc>()(["text", "_creationTime"], "desc")`. The
 * key is the type-level order key of the streams it will be merged with
 * (the index fields that still vary, tiebreaker included).
 *
 * @experimental
 */
export const empty =
  <Doc>(): {
    <const Key extends KeyFields>(
      key: Key,
    ): QueryStream<Doc, Types.Mutable<Key>, "asc", never, never>;
    <const Key extends KeyFields, Direction extends OrderDirection>(
      key: Key,
      order: Direction,
    ): QueryStream<Doc, Types.Mutable<Key>, Direction, never, never>;
  } =>
  (key: KeyFields, order: OrderDirection = "asc") => {
    const keyLayout = QueryStreamKeyFields.fromIndex(key);
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
 * The subset of a Convex database reader a leaf stream needs to (re)build
 * its query. (Method syntax keeps the parameter types bivariant, so the
 * strongly-typed readers Confect holds assign to it structurally.)
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
 * What a leaf stream stores instead of a constructed query: everything
 * needed to rebuild `db.query(table).withIndex(index, range).order(order)`.
 * A Convex query object is one-shot (its first iteration consumes it), so a
 * leaf holds this *recipe* and re-executes it on every run of the stream—the Effect formulation of `convex-helpers`' `reflect()`. It is also the
 * data a future `QueryStreamIndexRange.splitRange`-style `narrow` needs in order to rebuild the
 * leaf with tighter index bounds instead of filtering in memory.
 *
 * @experimental
 */
export interface Reflection<Direction extends OrderDirection = OrderDirection> {
  readonly reader: ReflectionReader;
  readonly tableName: string;
  readonly tableSchema: Schema.Codec<any, any>;
  readonly indexName: string;
  /**
   * All of the index's fields in order, including the `_creationTime`
   * tiebreaker (for `by_id`, just `["_id"]`).
   */
  readonly indexFields: KeyFields;
  /** The recorded range: `eq` pins the first `spec.eqCount` index fields. */
  readonly spec: AnyIndexRangeSpec;
  readonly order: Direction;
  /**
   * The effective full-index-key bounds of this leaf. Absent on
   * construction (derived from `spec`); present—and tighter—on leaves
   * produced by `narrow` pushing cursor bounds down.
   */
  readonly bounds?: IndexBounds;
}

/**
 * Build a leaf `QueryStream` from reflection data.
 *
 * In SQL terms: an index range scan—`SELECT * FROM table WHERE <range>
 * ORDER BY <index fields> [DESC]`; the order key is the `ORDER BY` columns
 * left after the equality predicates. The value is a reusable description
 * of a query rather than a result.
 *
 * Each run rebuilds the Convex queries from the reflection—the leaf's
 * bounds decomposed into Convex-expressible index ranges via `QueryStreamIndexRange.splitRange`—and order keys are extracted from the *encoded* document before schema
 * decoding.
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
  KeyFields,
  Direction,
  Document.DocumentDecodeError,
  never
> =>
  makeLeaf(
    reflection,
    reflection.bounds === undefined
      ? QueryStreamIndexRange.boundsFromSpec(reflection.spec)
      : QueryStreamKeyBounds.intersectIndexBounds(
          QueryStreamIndexRange.boundsFromSpec(reflection.spec),
          reflection.bounds,
        ),
  );

const makeLeaf = <Doc, Direction extends OrderDirection>(
  reflection: Reflection<Direction>,
  bounds: IndexBounds,
): QueryStream<
  Doc,
  KeyFields,
  Direction,
  Document.DocumentDecodeError,
  never
> => {
  // Bounds and range splitting work in full index-key space: the index's
  // fields plus the implicit `_id` tiebreaker (already explicit for
  // `by_id`). Convex accepts range constraints on `_creationTime` and
  // `_id` even though its index types don't advertise them.
  const fullIndexLayout = QueryStreamKeyFields.fromIndex(
    reflection.indexFields,
  );
  const keyLayout = QueryStreamKeyFields.drop(
    fullIndexLayout,
    reflection.spec.eqCount,
  );
  const fullIndexFields = QueryStreamKeyFields.names(fullIndexLayout);
  const keyPaths = Array.map(QueryStreamKeyFields.names(keyLayout), (field) =>
    String.split(field, "."),
  );
  // `eq`-pinned values form a shared prefix of both bound keys.
  const eqValues = Array.take(bounds.lower.key, reflection.spec.eqCount);
  const segments = QueryStreamIndexRange.splitRange(
    fullIndexFields,
    reflection.order,
    bounds,
  );

  const encodedDocuments = Stream.fromIterable(segments).pipe(
    Stream.flatMap((segment) =>
      Stream.suspend(() =>
        Stream.fromAsyncIterable(
          reflection.reader
            .query(reflection.tableName)
            .withIndex(reflection.indexName, (q) =>
              QueryStreamIndexRange.applyOps(segment, q),
            )
            .order(reflection.order),
          identity,
        ),
      ),
    ),
    Stream.orDie,
  );

  const charged = QueryStreamReadBudget.charge(encodedDocuments);

  const annotated = charged.pipe(
    Stream.mapEffect((encoded) =>
      Effect.map(
        Document.decode(reflection.tableName, reflection.tableSchema)(encoded),
        (doc) =>
          new Element({
            doc: Option.some(doc as Doc),
            key: QueryStreamOrderKey.extract(
              encoded as Record.ReadonlyRecord<string, unknown>,
              keyPaths,
            ),
          }),
      ),
    ),
  );

  const toFullKeySpace = (bound: KeyBound): KeyBound => ({
    key: Array.appendAll(eqValues, bound.key),
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
): Effect.Effect<MergeSource<Doc, E>, E> =>
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
            const budget = yield* QueryStreamReadBudget.current;
            return (yield* QueryStreamReadBudget.isStopped(budget))
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
 * earliest head (ties go to the earliest source, keeping the merge stable),
 * and return the sources with that head consumed. `undefined` when every
 * source is exhausted or an input stopped before its next key was known.
 */
const mergeStep =
  <Doc, E>(PositionOrder: Order.Order<OrderKey>) =>
  (
    sources: ReadonlyArray<MergeSource<Doc, E>>,
  ): Effect.Effect<
    readonly [Element<Doc>, ReadonlyArray<MergeSource<Doc, E>>] | undefined,
    E
  > =>
    Effect.gen(function* () {
      const budgetStatus = yield* QueryStreamReadBudget.current;
      const filled = yield* Effect.forEach(sources, fillMergeSource, {
        concurrency: Option.match(budgetStatus, {
          onNone: () => "unbounded" as const,
          onSome: () => 1,
        }),
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
                    isEarlier(head.key, bestElement.key)
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
 * Merge streams ordered by the same key into one ordered stream.
 *
 * In SQL terms: `UNION ALL` of queries that share an `ORDER BY`, with the
 * result still in that order (a planner's merge append). It is an ordered
 * merge—the step of merge sort that combines sorted runs, always emitting
 * the smallest next key (the largest, descending)—not `Stream.merge`,
 * which interleaves inputs in arrival order.
 *
 * Streams with different order keys are a **type error** (`Key` is
 * invariant), and so are different directions: the first stream fixes the
 * direction and each later one must be assignable to it. A mismatch the
 * types can't see—a runtime-chosen direction, or an untyped call site—throws here, when the streams are combined.
 *
 * @experimental
 */
export const merge = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Direction extends OrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, Key, Direction, E, R>,
    ...ReadonlyArray<QueryStream<Doc, Key, NoInfer<Direction>, E, R>>,
  ],
): QueryStream<Doc, Key, Direction, E, R> => {
  const head = Array.headNonEmpty(streams);
  const incompatible = Array.findFirst(
    Array.tailNonEmpty(streams),
    (stream) =>
      stream.order !== head.order ||
      !QueryStreamKeyFields.Equivalence(stream.keyFields, head.keyFields),
  );
  if (Option.isSome(incompatible)) {
    throw new Error(
      `QueryStream.merge: all streams must share an order and order-key fields (got ${head.order} [${Array.join(head.keyFields, ", ")}] and ${incompatible.value.order} [${Array.join(incompatible.value.keyFields, ", ")}])`,
    );
  }
  return mergeUnchecked(streams);
};

/**
 * `merge` without the compatibility check—for re-merging branches that
 * were validated when the merge was built (narrowing never changes a
 * branch's order or key fields).
 */
const mergeUnchecked = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Direction extends OrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, Key, Direction, E, R>,
    ...ReadonlyArray<QueryStream<Doc, Key, Direction, E, R>>,
  ],
): QueryStream<Doc, Key, Direction, E, R> => {
  const head = Array.headNonEmpty(streams);
  const annotated: Stream.Stream<Element<Doc>, E, R> = Stream.unwrap(
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
        narrowByKeyBounds(head, keyBounds),
        ...Array.map(Array.tailNonEmpty(streams), (stream) =>
          narrowByKeyBounds(stream, keyBounds),
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
 * remains mergeable and paginable; narrowing narrows the input and
 * re-applies the transform, so cursor bounds keep pushing down to leaves.
 */
const transform = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Doc2,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
  f: (doc: Doc) => Option.Option<Doc2>,
): QueryStream<Doc2, Key, Direction, E, R> =>
  new QueryStream(
    self.order,
    self.keyLayout,
    Stream.map(
      self.annotated,
      ({ doc, key }) => new Element({ doc: Option.flatMap(doc, f), key }),
    ),
    undefined,
    (keyBounds) => transform(narrowByKeyBounds(self, keyBounds), f),
    () => transform(reverse(self), f),
  );

/** The effectful {@link transform}. */
const transformEffect = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Doc2,
  E2,
  R2,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
  f: (doc: Doc) => Effect.Effect<Option.Option<Doc2>, E2, R2>,
  options: EffectOptions | undefined,
): QueryStream<Doc2, Key, Direction, E | E2, R | R2> =>
  new QueryStream(
    self.order,
    self.keyLayout,
    Stream.mapEffect(
      self.annotated,
      ({ doc, key }) =>
        Option.match(doc, {
          onNone: () =>
            Effect.succeed(new Element({ doc: Option.none<Doc2>(), key })),
          onSome: (value) =>
            Effect.map(f(value), (mapped) => new Element({ doc: mapped, key })),
        }),
      // Order is preserved at any concurrency: elements are emitted in
      // input order however their effects finish.
      { concurrency: options?.concurrency },
    ),
    undefined,
    (keyBounds) =>
      transformEffect(narrowByKeyBounds(self, keyBounds), f, options),
    () => transformEffect(reverse(self), f, options),
  );

/**
 * Options for the effectful transforms (`filterEffect`, `mapEffect`).
 *
 * @experimental
 */
export interface EffectOptions {
  /**
   * How many documents' effects may run at once (`"unbounded"` for all).
   * Elements are emitted in stream order regardless, so the result stays
   * a query stream with the same order key. Defaults to one at a time.
   */
  readonly concurrency?: number | "unbounded" | undefined;
}

/**
 * Filter with a pure predicate.
 *
 * In SQL terms: a `WHERE` on any column, evaluated after the index scan—rows it rejects were still read, and filtered-out elements still advance
 * cursors, so the result stays mergeable and paginable.
 *
 * Use `filterEffect` when the predicate needs to read the database or
 * another service.
 *
 * @experimental
 */
export const filter = dual<
  <Doc>(
    predicate: (doc: Doc) => boolean,
  ) => <Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc, Key, Direction, E, R>,
  <Doc, Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
    predicate: (doc: Doc) => boolean,
  ) => QueryStream<Doc, Key, Direction, E, R>
>(2, (self, predicate) =>
  transform(self, (doc) => (predicate(doc) ? Option.some(doc) : Option.none())),
);

/**
 * Filter with an effectful predicate.
 *
 * In SQL terms: a `WHERE` whose predicate runs a subquery—`WHERE EXISTS
 * (...)`, or any predicate that reads other tables. The predicate's
 * `E2`/`R2` flow into the stream's channels, and filtered-out elements
 * still advance cursors, as with `filter`.
 *
 * @experimental
 */
export const filterEffect = dual<
  <Doc, E2, R2>(
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
    options?: EffectOptions,
  ) => <Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc, Key, Direction, E | E2, R | R2>,
  <Doc, Key extends KeyFields, E, R, E2, R2, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc, Key, Direction, E | E2, R | R2>
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
 * Transform elements with a pure function while preserving order keys.
 *
 * In SQL terms: the `SELECT` list—projecting or computing columns while
 * the `ORDER BY` columns stay in force, so the result stays mergeable and
 * paginable.
 *
 * The mapper must not change the ordering semantics. Use `mapEffect` when
 * the mapper needs to read the database or another service.
 *
 * @experimental
 */
export const map = dual<
  <Doc, Doc2>(
    f: (doc: Doc) => Doc2,
  ) => <Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc2, Key, Direction, E, R>,
  <Doc, Key extends KeyFields, E, R, Doc2, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
    f: (doc: Doc) => Doc2,
  ) => QueryStream<Doc2, Key, Direction, E, R>
>(2, (self, f) => transform(self, (doc) => Option.some(f(doc))));

/**
 * Transform elements with an effectful function while preserving order
 * keys.
 *
 * In SQL terms: a scalar subquery in the `SELECT` list—a computed column
 * that reads other tables. The mapper's `E2`/`R2` flow into the stream's
 * channels.
 *
 * The mapper must not change the ordering semantics.
 *
 * @experimental
 */
export const mapEffect = dual<
  <Doc, Doc2, E2, R2>(
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
    options?: EffectOptions,
  ) => <Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc2, Key, Direction, E | E2, R | R2>,
  <
    Doc,
    Key extends KeyFields,
    E,
    R,
    Doc2,
    E2,
    R2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, Direction, E, R>,
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc2, Key, Direction, E | E2, R | R2>
>(
  (args) => isQueryStream(args[0]),
  (self, f, options) =>
    transformEffect(self, (doc) => Effect.asSome(f(doc)), options),
);

/**
 * A join: for each outer document, stream the documents of the inner stream
 * produced by `f`, ordered by (outer key, then inner key).
 *
 * In SQL terms: `CROSS JOIN LATERAL` (`CROSS APPLY`): the inner query can
 * reference the outer row, and the result is ordered by the outer key, then
 * the inner key. An outer row with no inner rows contributes none—an
 * inner join—unless `options.onEmpty` is given, which makes it `LEFT JOIN
 * LATERAL`: the row still appears once, with `onEmpty(outer)` standing in
 * for the `NULL` inner columns. Inner streams run sequentially—each outer
 * element's is drained before the next outer element's begins—and the
 * order key is extended by the inner key (`flatMap` on `convex-helpers`
 * streams).
 *
 * `options.innerKey` is the order key shared by *every* inner stream—checked against `f`'s return type, so a mismatched literal is a type
 * error; each produced stream is also validated at runtime (a defect on
 * mismatch, like `merge`).
 *
 * `options.onEmpty` keeps outer documents whose inner stream is empty,
 * emitting `onEmpty(outer)` in their place; the element type widens to
 * include the placeholder. The placeholder takes the position an empty
 * inner stream's marker would (the outer key followed by `null`s), so it
 * sorts first within its outer document and pagination resumes past it like
 * any element. Outer documents filtered out upstream stay absent.
 *
 * Cursor accounting: an outer document whose inner stream is empty—or
 * that was filtered out upstream—still contributes one filtered element
 * whose inner key components are `null`s, so cursors advance past the cost
 * of reading it. Narrowing splits bounds at the outer/inner seam: the outer
 * stream is narrowed by the bounds' outer components, and the inner bound
 * applies only to the *boundary* outer row (the row whose outer key equals
 * the bound's outer prefix)—other rows' inner streams run in full. (This
 * deliberately deviates from `convex-helpers`, which narrows every row's
 * inner stream and so drops legitimate elements from non-boundary rows.)
 *
 * Inner streams must run in the outer stream's direction. In the
 * data-first form the outer stream fixes the direction and a differing
 * inner stream is flagged; in the data-last form the inner streams fix it,
 * so an outer stream typed with the union needs union-typed inner streams.
 * A mismatch the types can't see fails when the join runs.
 *
 * @experimental
 */
export const flatMap = dual<
  <
    Doc,
    Doc2,
    InnerKey extends KeyFields,
    E2,
    R2,
    Direction extends OrderDirection,
    Doc3 = never,
  >(
    f: (doc: Doc) => QueryStream<Doc2, InnerKey, Direction, E2, R2>,
    options: {
      readonly innerKey: NoInfer<InnerKey>;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => <Key extends KeyFields, E, R>(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<
    Doc2 | Doc3,
    readonly [...Key, ...InnerKey],
    Direction,
    E | E2,
    R | R2
  >,
  <
    Doc,
    Key extends KeyFields,
    E,
    R,
    Doc2,
    InnerKey extends KeyFields,
    E2,
    R2,
    Direction extends OrderDirection,
    Doc3 = never,
  >(
    self: QueryStream<Doc, Key, Direction, E, R>,
    f: (doc: Doc) => QueryStream<Doc2, InnerKey, NoInfer<Direction>, E2, R2>,
    options: {
      readonly innerKey: NoInfer<InnerKey>;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => QueryStream<
    Doc2 | Doc3,
    readonly [...Key, ...InnerKey],
    Direction,
    E | E2,
    R | R2
  >
>(3, (self, f, options) => {
  return makeFlatMap(
    self,
    f,
    QueryStreamKeyFields.fromIndex(options.innerKey),
    Option.fromUndefinedOr(options.onEmpty),
    { lower: Option.none(), upper: Option.none() },
  );
});

/** Inner bounds that apply only to the outer row whose key is `outer`. */
interface InnerRefinement {
  readonly outer: OrderKey;
  readonly inner: KeyBound;
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
              inner: QueryStreamKeyBounds.tightestLower(
                left.inner,
                right.inner,
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
              inner: QueryStreamKeyBounds.tightestUpper(
                left.inner,
                right.inner,
              ),
            };
    }),
    () => Option.orElse(existing, () => incoming),
  );

const makeFlatMap = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Doc2,
  InnerKey extends KeyFields,
  E2,
  R2,
  Direction extends OrderDirection,
  Doc3 = never,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
  f: (doc: Doc) => QueryStream<Doc2, InnerKey, Direction, E2, R2>,
  innerKeyLayout: QueryStreamKeyFields.QueryStreamKeyFields,
  /** What an outer document with no inner rows emits, if it is kept. */
  onEmpty: Option.Option<(doc: Doc) => Doc3>,
  refinements: InnerRefinements,
): QueryStream<
  Doc2 | Doc3,
  readonly [...Key, ...InnerKey],
  Direction,
  E | E2,
  R | R2
> => {
  const outerLength = self.keyFields.length;
  const keyLayout = QueryStreamKeyFields.concat(self.keyLayout, innerKeyLayout);
  const innerKeyFields = QueryStreamKeyFields.names(innerKeyLayout);
  // The inner key of an outer document that contributes no inner elements
  // (filtered out, or an empty inner stream).
  const nullPadding: OrderKey = Array.makeBy(innerKeyFields.length, () => null);

  // Every inner stream `f` returns has the same type-level key and
  // direction, so the first one's runtime check (which catches the union
  // direction case and untyped callers) covers the rest.
  let validatedOnce = false;
  const validated = (
    inner: QueryStream<Doc2, InnerKey, Direction, E2, R2>,
  ): QueryStream<Doc2, InnerKey, Direction, E2, R2> => {
    if (validatedOnce) {
      return inner;
    }
    if (inner.order !== self.order) {
      throw new Error(
        `QueryStream.flatMap: inner stream order (${inner.order}) differs from the outer stream's (${self.order})`,
      );
    }
    if (!QueryStreamKeyFields.Equivalence(inner.keyFields, innerKeyFields)) {
      throw new Error(
        `QueryStream.flatMap: inner stream order-key fields ([${Array.join(inner.keyFields, ", ")}]) differ from innerKey ([${Array.join(innerKeyFields, ", ")}])`,
      );
    }
    validatedOnce = true;
    return inner;
  };

  const innerBoundsFor = (outerKey: OrderKey): KeyBounds => ({
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
  });

  // The single element an outer document contributes when it has no inner
  // elements: filtered (cursor accounting only), or—for a left join—the
  // `onEmpty` placeholder. Either sits at the outer key followed by `null`s,
  // and is emitted only if that position is within the inner bounds.
  const markerStream = (
    outerKey: OrderKey,
    innerBounds: KeyBounds,
    doc: Option.Option<Doc2 | Doc3>,
  ): Stream.Stream<Element<Doc2 | Doc3>> =>
    QueryStreamKeyBounds.admittedByLower(innerBounds.lower)(nullPadding) &&
    QueryStreamKeyBounds.admittedByUpper(innerBounds.upper)(nullPadding)
      ? Stream.succeed(
          new Element({ doc, key: Array.appendAll(outerKey, nullPadding) }),
        )
      : Stream.empty;

  const annotated: Stream.Stream<
    Element<Doc2 | Doc3>,
    E | E2,
    R | R2
  > = self.annotated.pipe(
    Stream.flatMap(({ doc: outerDoc, key: outerKey }) => {
      const innerBounds = innerBoundsFor(outerKey);
      return Option.match(outerDoc, {
        onNone: () => markerStream(outerKey, innerBounds, Option.none()),
        onSome: (doc) => {
          const inner = validated(f(doc));
          return narrowByKeyBounds(inner, innerBounds).annotated.pipe(
            Stream.map(
              ({ doc: innerDoc, key: innerKey }) =>
                new Element({
                  doc: innerDoc,
                  key: Array.appendAll(outerKey, innerKey),
                }),
            ),
            Stream.orElseIfEmpty(() =>
              Stream.unwrap(
                Effect.gen(function* () {
                  const budgetStatus = yield* QueryStreamReadBudget.current;
                  if (yield* QueryStreamReadBudget.isStopped(budgetStatus))
                    return Stream.empty;
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
                  const isStopped =
                    yield* QueryStreamReadBudget.isStopped(budgetStatus);
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

  const split = ({ key, inclusive }: KeyBound): FlatMapBound =>
    key.length <= outerLength
      ? FlatMapBound.Outer({ key, inclusive })
      : FlatMapBound.Inner({
          outer: Array.take(key, outerLength),
          inner: { key: Array.drop(key, outerLength), inclusive },
        });

  const outerBound = (bound: FlatMapBound): KeyBound =>
    FlatMapBound.$match(bound, {
      Outer: ({ key, inclusive }) => ({ key, inclusive }),
      Inner: ({ outer }) => ({ key: outer, inclusive: true }),
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
 * Keep the first document for each distinct value of a *prefix* of the
 * order key.
 *
 * In SQL terms: PostgreSQL's `SELECT DISTINCT ON (prefix) ... ORDER BY
 * prefix, ...`—the first row of each group—executed as a loose index
 * scan (skip scan): after a group's first document, the underlying stream
 * is narrowed past the entire group, so each group costs one index seek
 * instead of a scan.
 *
 * `fields` must be a prefix of the stream's order key—enforced at the
 * type level (`Key` must extend `readonly [...Fields, ...rest]`) and
 * validated at runtime.
 *
 * A filter before `distinct` selects the first matching document; a filter
 * after it filters the chosen representatives. Selection uses the input's
 * original order and bounds. Reversal changes only the output order, and
 * narrowing filters the original representatives rather than selecting
 * replacements. Reverse traversal discovers each group and seeks its
 * representative in the original direction; callbacks may be reevaluated.
 *
 * @experimental
 */
export const distinct = dual<
  <const Fields extends KeyFields>(
    fields: Fields,
  ) => <
    Doc,
    Key extends readonly [...Fields, ...KeyFields],
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc, Key, Direction, E, R>,
  <
    const Fields extends KeyFields,
    Doc,
    Key extends readonly [...Fields, ...KeyFields],
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, Direction, E, R>,
    fields: Fields,
  ) => QueryStream<Doc, Key, Direction, E, R>
>(2, (self, fields) => {
  const visible = QueryStreamKeyFields.visibleKeyFields(self.keyLayout);
  if (
    !QueryStreamKeyFields.Equivalence(
      fields,
      Array.take(visible, fields.length),
    )
  ) {
    throw new Error(
      `QueryStream.distinct: fields ([${Array.join(fields, ", ")}]) must be a prefix of the stream's order-key fields ([${Array.join(visible, ", ")}])`,
    );
  }
  // Groups are runs of equal *runtime* prefixes, so a prefix that reaches
  // past a tiebreaker (into a `flatMap` result's inner key) includes it.
  return makeDistinct(
    self,
    Result.getOrThrowWith(
      QueryStreamKeyFields.runtimePrefixLength(self.keyLayout, fields.length),
      identity,
    ),
    self.order,
    {
      lower: Option.none(),
      upper: Option.none(),
    },
  );
});

/**
 * Re-key a stream: declare that its order key should be regarded as `key`,
 * a position-for-position relabeling of the order-key fields (the trailing
 * `_id` tiebreaker keeps its name).
 *
 * In SQL terms: column aliases (`AS`) that make the branches of a `UNION
 * ALL` line up by position; not `ORDER BY`, which it does not change. The
 * elements and their order are untouched—it exists so that `merge`
 * accepts streams whose keys agree positionally.
 *
 * Order keys are *values*, so relabeling changes only the names used for
 * compatibility validation—the element order is untouched, and narrowing
 * passes bounds through to the underlying stream unchanged. Use it to make
 * streams from different indexes or tables mergeable when their keys align
 * positionally; the caller asserts the *semantic* alignment of the
 * relabeled fields.
 *
 * (This is `convex-helpers`' `.orderBy()`. There it may also drop
 * equality-pinned prefix fields from the key—Confect's remaining-field
 * order keys already drop those at the leaf.)
 *
 * `key` must have as many fields as the stream's order key, enforced at
 * the type level via tuple length. The implicit `_id` tiebreakers the
 * type-level key omits—the trailing one, and a `flatMap` result's
 * interior one—keep their names and positions.
 *
 * @experimental
 */
export const renameKey = dual<
  <const NewKey extends KeyFields>(
    key: NewKey,
  ) => <
    Doc,
    Key extends KeyFields & {
      readonly length: NewKey["length"];
    },
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc, Types.Mutable<NewKey>, Direction, E, R>,
  <
    const NewKey extends KeyFields,
    Doc,
    Key extends KeyFields & {
      readonly length: NewKey["length"];
    },
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, Direction, E, R>,
    key: NewKey,
  ) => QueryStream<Doc, Types.Mutable<NewKey>, Direction, E, R>
>(2, (self, key) => renameKeyImpl(self, key));

const renameKeyImpl = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  NewKey extends KeyFields,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
  key: NewKey,
): QueryStream<Doc, Types.Mutable<NewKey>, Direction, E, R> => {
  const keyLayout = Result.getOrThrowWith(
    QueryStreamKeyFields.rename(self.keyLayout, key),
    identity,
  );
  return new QueryStream(
    self.order,
    keyLayout,
    self.annotated,
    undefined,
    // Bounds are positional values, so they apply to the underlying
    // stream as-is.
    (bounds) => renameKeyImpl(narrowByKeyBounds(self, bounds), key),
    () => renameKeyImpl(reverse(self), key),
  );
};

const makeDistinct = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, OrderDirection, E, R>,
  distinctLength: number,
  order: Direction,
  bounds: KeyBounds,
): QueryStream<Doc, Key, Direction, E, R> => {
  const afterKey = (key: OrderKey): KeyBounds => {
    const pastGroup: KeyBound = {
      key,
      inclusive: false,
    };
    return order === "asc"
      ? { lower: Option.some(pastGroup), upper: Option.none() }
      : { lower: Option.none(), upper: Option.some(pastGroup) };
  };
  const groupBound = (
    bound: Option.Option<KeyBound>,
  ): Option.Option<KeyBound> =>
    Option.map(bound, ({ inclusive, key }) => ({
      key: Array.take(key, distinctLength),
      inclusive: key.length > distinctLength || inclusive,
    }));
  const isAdmitted = (key: OrderKey) =>
    QueryStreamKeyBounds.admittedByLower(bounds.lower)(key) &&
    QueryStreamKeyBounds.admittedByUpper(bounds.upper)(key);
  const annotated = Stream.unwrap(
    Effect.map(QueryStreamReadBudget.current, (budgetStatus) =>
      Stream.paginate(
        narrowByKeyBounds(order === self.order ? self : reverse(self), {
          lower: groupBound(bounds.lower),
          upper: groupBound(bounds.upper),
        }),
        (
          current: QueryStream<Doc, Key, OrderDirection, E, R>,
        ): Effect.Effect<
          readonly [ReadonlyArray<Element<Doc>>, Option.Option<typeof current>],
          E,
          R
        > =>
          Effect.gen(function* () {
            if (yield* QueryStreamReadBudget.isStopped(budgetStatus))
              return Tuple.make([], Option.none());
            const discovered = yield* Stream.runHead(current.annotated);
            if (Option.isNone(discovered)) return Tuple.make([], Option.none());
            const element = discovered.value;
            const { doc, key } = element;
            const prefix = Array.take(key, distinctLength);
            if (order === self.order) {
              const nextKey = Option.match(doc, {
                onNone: () => key,
                onSome: () => prefix,
              });
              return Tuple.make(
                isAdmitted(key) ? [element] : [],
                Option.some(narrowByKeyBounds(current, afterKey(nextKey))),
              );
            }
            const next = Option.some(
              narrowByKeyBounds(current, afterKey(prefix)),
            );
            const { firstKey, selected } = yield* narrowByKeyBounds(self, {
              lower: Option.some({ key: prefix, inclusive: true }),
              upper: Option.some({ key: prefix, inclusive: true }),
            }).annotated.pipe(
              Stream.run(
                Sink.fold(
                  () => ({
                    firstKey: Option.none<OrderKey>(),
                    selected: Option.none<Element<Doc>>(),
                  }),
                  (probe) => Option.isNone(probe.selected),
                  (probe, candidate: Element<Doc>) =>
                    Effect.succeed({
                      firstKey: Option.orElse(probe.firstKey, () =>
                        Option.some(candidate.key),
                      ),
                      selected: Option.as(candidate.doc, candidate),
                    }),
                ),
              ),
            );
            if (Option.isSome(selected)) {
              const representative = selected.value;
              return Tuple.make(
                isAdmitted(representative.key) ? [representative] : [],
                next,
              );
            }
            if (yield* QueryStreamReadBudget.isStopped(budgetStatus))
              return Tuple.make([], Option.none());
            const checkpoint = Option.getOrElse(firstKey, () => key);
            return Tuple.make(
              isAdmitted(checkpoint)
                ? [new Element({ doc: Option.none<Doc>(), key: checkpoint })]
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
        QueryStreamKeyBounds.intersect(bounds, keyBounds),
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
 * Run a stream in the opposite direction.
 *
 * In SQL terms: reversing the outer `ORDER BY`, without changing which
 * rows the query selects. Results are read through index scans and seeks,
 * not collected and reversed. A paginated feed can load its earlier pages
 * with the returned query stream.
 *
 * `merge`, the transforms, `flatMap`, `renameKey`, and `empty`
 * reverse their inputs and re-apply themselves. A distinct stream keeps
 * its original representatives, seeking them in the original selection
 * direction while visiting groups in the opposite order. Applying
 * `distinct` after reversing the input instead selects different rows.
 * Externally constructed streams without `reverseWith` throw.
 *
 * @experimental
 */
export const reverse = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
): QueryStream<Doc, Key, Flip<Direction>, E, R> => {
  if (self.reverseWith === undefined) {
    throw new Error(
      "QueryStream.reverse: this stream cannot be reversed without a reversal recipe",
    );
  }
  return self.reverseWith();
};

/**
 * Restrict a stream to the order keys between `start` and `end` (in stream
 * order), including each endpoint only when its `inclusive` flag is true.
 * For descending streams, `start` is the upper key and `end` the lower key.
 * At least one endpoint is required; the other can be left unbounded.
 * A prefix key includes or excludes the whole group of keys extending it;
 * distinct streams apply full-key bounds to their original representatives,
 * without selecting replacements. Narrowing intersects existing bounds.
 *
 * In SQL terms: keyset predicates on the `ORDER BY` columns—`WHERE (k1,
 * k2) >= (:start) AND (k1, k2) < (:end)` for an ascending, start-inclusive,
 * end-exclusive range—added to every query in the
 * composition. Bounds are pushed into index ranges where doing so
 * preserves the query's results. Distinct streams may read outside the
 * output bounds to recover original representatives. Streams without a
 * `narrowWith` (constructed externally)
 * fall back to filtering the annotated stream in memory.
 *
 * @experimental
 */
export const narrow = dual<
  (
    bounds: NarrowBounds,
  ) => <Doc, Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
  ) => QueryStream<Doc, Key, Direction, E, R>,
  <Doc, Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
    bounds: NarrowBounds,
  ) => QueryStream<Doc, Key, Direction, E, R>
>(
  2,
  <Doc, Key extends KeyFields, E, R, Direction extends OrderDirection>(
    self: QueryStream<Doc, Key, Direction, E, R>,
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
  Key extends KeyFields,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
  bounds: KeyBounds,
): QueryStream<Doc, Key, Direction, E, R> =>
  Option.isNone(bounds.lower) && Option.isNone(bounds.upper)
    ? self
    : self.narrowWith !== undefined
      ? self.narrowWith(bounds)
      : narrowInMemory(self, bounds);

/** The fallback for streams that don't know how to rebuild themselves. */
const narrowInMemory = <
  Doc,
  Key extends KeyFields,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, Direction, E, R>,
  bounds: KeyBounds,
): QueryStream<Doc, Key, Direction, E, R> => {
  type Narrower = (
    annotated: Stream.Stream<Element<Doc>, E, R>,
  ) => Stream.Stream<Element<Doc>, E, R>;

  const aboveLower = QueryStreamKeyBounds.admittedByLower(bounds.lower);
  const belowUpper = QueryStreamKeyBounds.admittedByUpper(bounds.upper);

  const dropOutOfRange: Narrower =
    self.order === "asc"
      ? Stream.dropWhile(({ key }) => !aboveLower(key))
      : Stream.dropWhile(({ key }) => !belowUpper(key));
  const takeInRange: Narrower =
    self.order === "asc"
      ? Stream.takeWhile(({ key }) => belowUpper(key))
      : Stream.takeWhile(({ key }) => aboveLower(key));

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
 * Expect zero or one element; fail with `NotUniqueError` on two or more.
 *
 * In SQL terms: a query that must return at most one row (Convex's
 * `.unique()`)—`LIMIT 2` followed by a check.
 *
 * @experimental
 */
export const unique = Effect.fn("QueryStream.unique")(
  <Doc, Key extends KeyFields, E, R>(
    self: QueryStream<Doc, Key, OrderDirection, E, R>,
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
 * Reading this many rows into one page earns a `SplitRecommended`—half of
 * `convex-helpers`' `MAX_DOCUMENT_SCAN_LEN` (32000), as there.
 */
const SOFT_MAX_SCAN_LENGTH = 16000;

/**
 * The pagination protocol's request options—`PaginationOptions` from
 * `convex/server`, aliased so the wire protocol has a single source of
 * truth (`@confect/core`'s `PaginationOptions` schema encodes the same
 * shape).
 *
 * @experimental
 */
export type PaginateOptions = ConvexPaginationOptions;

/**
 * The pagination protocol's result—`PaginationResult` from
 * `convex/server` (whose `page` is a mutable array type, which is why
 * handlers can return this value where Convex expects its result shape).
 *
 * @experimental
 */
export type PaginationResult<Doc> = ConvexPaginationResult<Doc>;

type PageStop = Data.TaggedEnum<{
  ItemLimit: {};
  ReadLimit: {};
}>;

const PageStop = Data.taggedEnum<PageStop>();

class PaginateState<Doc> extends Data.Class<{
  readonly page: Chunk.Chunk<Doc>;
  readonly readKeys: Chunk.Chunk<OrderKey>;
  readonly stop: Option.Option<PageStop>;
}> {}

/** Where a split page divides: the midpoint of the keys read so far. */
const midpointKey = (readKeys: Chunk.Chunk<OrderKey>): OrderKey =>
  Chunk.getUnsafe(readKeys, Math.floor((Chunk.size(readKeys) - 1) / 2));

/**
 * Consume one page of a stream.
 *
 * In SQL terms: keyset pagination—`WHERE (key) > :cursor ORDER BY key
 * LIMIT :numItems`; with `endCursor`, `AND (key) <= :endCursor` and no
 * `LIMIT`. It runs the stream narrowed to the keys after `cursor` (and up
 * to `endCursor`, when given), folds `numItems` present documents into a
 * page, and reports the key it stopped at as the next cursor; a cursor is a
 * key, not an offset, so a page costs one page of reads wherever it starts.
 *
 * Semantics follow `convex-helpers/server/stream`:
 *
 * - `cursor` is exclusive, `endCursor` inclusive; when `endCursor` is set,
 *   `numItems` is ignored and the page runs to the end cursor—the
 *   reactive-adjacency guarantee that keeps concurrent pages gap-free.
 * - Row and byte budgets count all QueryStream leaf reads, including
 *   filtered documents, discovery seeks, and prefetched merge inputs.
 *   Bytes use estimated document sizes, not backend-billed bytes; a
 *   document's size is known only after it is read.
 * - Budget stops return `SplitRequired` at a safe output boundary. If no
 *   safe progress is possible, the effect fails with `QueryStreamReadBudget.ReadBudgetExceededError`.
 *   A resource stop never proves an input or a distinct group empty.
 *
 * @experimental
 */
export const paginate: {
  (
    options: PaginateOptions,
  ): <Doc, Key extends KeyFields, E, R>(
    self: QueryStream<Doc, Key, OrderDirection, E, R>,
  ) => Effect.Effect<
    PaginationResult<Doc>,
    E | QueryStreamReadBudget.ReadBudgetExceededError,
    R
  >;
  <Doc, Key extends KeyFields, E, R>(
    self: QueryStream<Doc, Key, OrderDirection, E, R>,
    options: PaginateOptions,
  ): Effect.Effect<
    PaginationResult<Doc>,
    E | QueryStreamReadBudget.ReadBudgetExceededError,
    R
  >;
} = dual(
  2,
  Effect.fn("QueryStream.paginate")(function* <
    Doc,
    Key extends KeyFields,
    E,
    R,
    Direction extends OrderDirection,
  >(self: QueryStream<Doc, Key, Direction, E, R>, options: PaginateOptions) {
    const cursorSchema = QueryStreamCursor.codecForKeyFields(self.keyFields);
    const encodeCursor = Schema.encodeEffect(cursorSchema);
    const decodeCursor = Schema.decodeEffect(Schema.NullOr(cursorSchema));
    const endCursor = Option.fromNullishOr(options.endCursor);
    const pinnedEnd = Option.filter(
      endCursor,
      (cursor) => cursor !== QueryStreamCursor.END_CURSOR,
    );
    const decoded = yield* Effect.all({
      after: decodeCursor(options.cursor),
      until: decodeCursor(Option.getOrNull(pinnedEnd)),
    }).pipe(
      Effect.mapError(
        () => new ConvexError({ paginationError: "InvalidCursor" }),
      ),
      Effect.orDie,
    );
    const after = Option.fromNullOr(decoded.after);
    const until = Option.fromNullOr(decoded.until);
    if (options.numItems === 0) {
      if (options.cursor === null) {
        return yield* Effect.die(
          new Error(
            "QueryStream.paginate: numItems of 0 with a null cursor is not supported",
          ),
        );
      }
      return yield* Effect.succeed<PaginationResult<Doc>>({
        page: [],
        isDone: false,
        continueCursor: options.cursor,
      });
    }

    const start = Option.map(after, (key) => ({ key, inclusive: false }));
    const end = Option.map(until, (key) => ({ key, inclusive: true }));
    const narrowed = narrowByKeyBounds(
      self,
      self.order === "asc"
        ? { lower: start, upper: end }
        : { lower: end, upper: start },
    );
    // With an endCursor the page runs to it, however many items that is.
    const maxRows = Option.match(endCursor, {
      onNone: () => Option.some(options.numItems),
      onSome: () => Option.none<number>(),
    });
    const budget = yield* QueryStreamReadBudget.make({
      maximumRowsRead: Option.fromUndefinedOr(options.maximumRowsRead),
      maximumBytesRead: Option.fromUndefinedOr(options.maximumBytesRead),
    });
    const collected = yield* pipe(
      Stream.run(
        narrowed.annotated,
        Sink.fold(
          () =>
            new PaginateState<Doc>({
              page: Chunk.empty(),
              readKeys: Chunk.empty(),
              stop: Option.none(),
            }),
          (state) => Option.isNone(state.stop),
          (state, { doc, key }: Element<Doc>) => {
            const readKeys = Chunk.append(state.readKeys, key);
            const page = Option.match(doc, {
              onNone: () => state.page,
              onSome: (value) => Chunk.append(state.page, value),
            });
            return Effect.map(
              QueryStreamReadBudget.isExhausted(budget),
              (hitLimit) =>
                new PaginateState({
                  page,
                  readKeys,
                  stop: hitLimit
                    ? Option.some(PageStop.ReadLimit())
                    : Option.exists(
                          maxRows,
                          (limit) => Chunk.size(page) >= limit,
                        )
                      ? Option.some(PageStop.ItemLimit())
                      : Option.none(),
                }),
            );
          },
        ),
      ),
      QueryStreamReadBudget.provide(budget),
    );
    const stopped = yield* QueryStreamReadBudget.isStopped(Option.some(budget));
    const limited =
      stopped || Option.exists(collected.stop, PageStop.$is("ReadLimit"));
    if (
      limited &&
      (Chunk.isEmpty(collected.readKeys) ||
        Option.exists(
          until,
          (endpoint) =>
            QueryStreamOrderKey.Order(
              midpointKey(collected.readKeys),
              endpoint,
            ) === 0,
        ))
    ) {
      const error = yield* QueryStreamReadBudget.exceeded(budget);
      return yield* error;
    }
    const state = stopped
      ? new PaginateState({
          page: collected.page,
          readKeys: collected.readKeys,
          stop: Option.some(PageStop.ReadLimit()),
        })
      : collected;
    const page = Chunk.toArray(state.page);
    // `stopped` implies at least one element was read, so the last
    // read key exists exactly when the fold stopped early.
    const stoppedAt = Option.flatMap(state.stop, () =>
      Chunk.last(state.readKeys),
    );
    return yield* Option.match(stoppedAt, {
      onSome: (lastKey) =>
        Effect.gen(function* () {
          return Option.exists(state.stop, PageStop.$is("ReadLimit"))
            ? {
                page,
                isDone: false,
                continueCursor: yield* encodeCursor(lastKey),
                pageStatus: "SplitRequired" as const,
                splitCursor: yield* encodeCursor(midpointKey(state.readKeys)),
              }
            : // A growing page that had to scan far past its item budget
              // (a filter-heavy stream) recommends a split so reactive
              // clients can subdivide it instead of re-scanning forever.
              Chunk.size(state.readKeys) >= SOFT_MAX_SCAN_LENGTH
              ? {
                  page,
                  isDone: false,
                  continueCursor: yield* encodeCursor(lastKey),
                  pageStatus: "SplitRecommended" as const,
                  splitCursor: yield* encodeCursor(midpointKey(state.readKeys)),
                }
              : {
                  page,
                  isDone: false,
                  continueCursor: yield* encodeCursor(lastKey),
                };
        }),
      // The narrowed stream was exhausted: either we reached the
      // pinned end cursor (more may follow it) or the true end of
      // the stream. An endCursor-pinned page that has grown well
      // past its requested size recommends a split, so reactive
      // clients can subdivide it (as `convex-helpers` does).
      onNone: () =>
        Effect.gen(function* () {
          // Any pinned page—including one pinned to the end of the
          // stream—that has grown well past its requested size
          // recommends a split.
          const shouldRecommendSplit =
            Option.isSome(endCursor) &&
            (Chunk.size(state.readKeys) >= SOFT_MAX_SCAN_LENGTH ||
              Chunk.size(state.page) > options.numItems + 1);
          return shouldRecommendSplit && Chunk.size(state.readKeys) > 0
            ? {
                page,
                isDone: false,
                continueCursor: Option.getOrElse(
                  pinnedEnd,
                  () => QueryStreamCursor.END_CURSOR,
                ),
                pageStatus: "SplitRecommended" as const,
                splitCursor: yield* encodeCursor(midpointKey(state.readKeys)),
              }
            : {
                page,
                isDone: Option.isNone(pinnedEnd),
                continueCursor: Option.getOrElse(
                  pinnedEnd,
                  () => QueryStreamCursor.END_CURSOR,
                ),
              };
        }),
    }).pipe(Effect.orDie);
  }),
);
