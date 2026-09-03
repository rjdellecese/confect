/**
 * PROTOTYPE — a stream-first querying API for Confect.
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
 * Prototype limitations (all called out in the design doc):
 *
 * - `narrow` filters the annotated stream in memory rather than pushing
 *   bounds down into `withIndex` ranges (`splitRange` in `convex-helpers`),
 *   so resuming from a cursor re-reads the range from its start.
 * - No `flatMap` (join) or `distinct` (loose index scan) yet.
 * - Cursors serialize only the *remaining* (order-key) fields, not the full
 *   index key — equality-pinned values never leak into cursors.
 */
import type {
  GenericDocument,
  FieldTypeFromFieldPath,
  PaginationOptions as ConvexPaginationOptions,
  PaginationResult as ConvexPaginationResult,
} from "convex/server";
import {
  compareValues,
  ConvexError,
  convexToJson,
  jsonToConvex,
  type Value,
} from "convex/values";
import { identity, dual, pipe } from "effect/Function";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Array from "effect/Array";
import type * as Channel from "effect/Channel";
import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as Equivalence from "effect/Equivalence";
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
import type * as Types from "effect/Types";
import * as Document from "./Document";

export const TypeId = "@confect/server/QueryStream";
export type TypeId = typeof TypeId;

// -----------------------------------------------------------------------------
// Order keys
// -----------------------------------------------------------------------------

/**
 * The values of a document's order-key fields: the index fields that still
 * vary after equality pinning, plus the trailing `_id` tiebreaker. `undefined`
 * appears for optional fields that are absent.
 */
export type OrderKey = ReadonlyArray<Value | undefined>;

/**
 * An element of the annotated stream: the decoded document (`None` when the
 * element was read but filtered out — it still advances cursors) paired with
 * its order key.
 */
export type Element<Doc> = readonly [Option.Option<Doc>, OrderKey];

// -----------------------------------------------------------------------------
// Typed index ranges
// -----------------------------------------------------------------------------
//
// The range builder mirrors Convex's `IndexRangeBuilder`, but *consumes* the
// index-field tuple at the type level as `eq` pins fields. The remaining
// tuple becomes the resulting stream's order key, which is what `merge`
// checks for compatibility.

export const RangeSpecTypeId = "@confect/server/QueryStream/IndexRangeSpec";
export type RangeSpecTypeId = typeof RangeSpecTypeId;

export type RangeOp = {
  readonly _tag: "eq" | "gt" | "gte" | "lt" | "lte";
  readonly field: string;
  readonly value: Value | undefined;
};

/**
 * The result of applying a range callback: the recorded operations, plus a
 * phantom `Remaining` — the index fields not consumed by `eq` pinning.
 */
export interface IndexRangeSpec<out Fields extends ReadonlyArray<string>> {
  readonly [RangeSpecTypeId]: {
    readonly _Remaining: Types.Covariant<Fields>;
  };
  readonly eqCount: number;
  readonly ops: ReadonlyArray<RangeOp>;
}

export type AnyIndexRangeSpec = IndexRangeSpec<ReadonlyArray<string>>;

export type Remaining<Spec> = Spec extends IndexRangeSpec<infer R> ? R : never;

type Head<Fields extends ReadonlyArray<string>> = Fields extends readonly [
  infer H extends string,
  ...ReadonlyArray<string>,
]
  ? H
  : never;

type Tail<Fields extends ReadonlyArray<string>> = Fields extends readonly [
  string,
  ...infer Rest extends ReadonlyArray<string>,
]
  ? Rest
  : ReadonlyArray<string>;

/**
 * A typed index-range builder. `eq` must target the next unpinned index
 * field, and consumes it; `gt`/`gte`/`lt`/`lte` bound the next field without
 * consuming it (bounded fields still vary within the range).
 */
export interface RangeBuilder<
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
> extends IndexRangeSpec<Fields> {
  readonly eq: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => RangeBuilder<ConvexDoc, Tail<Fields>>;
  readonly gt: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => LowerBoundedRange<ConvexDoc, Fields>;
  readonly gte: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => LowerBoundedRange<ConvexDoc, Fields>;
  readonly lt: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
  readonly lte: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
}

/** After `gt`/`gte`, only an upper bound on the same field may follow. */
export interface LowerBoundedRange<
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
> extends IndexRangeSpec<Fields> {
  readonly lt: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
  readonly lte: (
    field: Head<Fields>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<Fields>>,
  ) => IndexRangeSpec<Fields>;
}

const makeRangeBuilder = (
  eqCount: number,
  ops: ReadonlyArray<RangeOp>,
): RangeBuilder<GenericDocument, ReadonlyArray<string>> => {
  const push =
    (tag: RangeOp["_tag"], nextEqCount: number) =>
    (field: string, value: Value | undefined) =>
      makeRangeBuilder(
        nextEqCount,
        Array.append(ops, { _tag: tag, field, value }),
      );

  return {
    [RangeSpecTypeId]: {
      _Remaining: identity as Types.Covariant<ReadonlyArray<string>>,
    },
    eqCount,
    ops,
    eq: push("eq", eqCount + 1),
    gt: push("gt", eqCount),
    gte: push("gte", eqCount),
    lt: push("lt", eqCount),
    lte: push("lte", eqCount),
  };
};

/** The initial builder handed to a range callback. */
export const rangeBuilder = <
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
>(): RangeBuilder<ConvexDoc, Fields> =>
  makeRangeBuilder(0, []) as unknown as RangeBuilder<ConvexDoc, Fields>;

/** Replay a recorded range spec onto Convex's real `IndexRangeBuilder`. */
export const applyRange = (spec: AnyIndexRangeSpec, q: any): any =>
  Array.reduce(spec.ops, q, (builder, op) =>
    builder[op._tag](op.field, op.value),
  );

/**
 * Append the implicit `_id` tiebreaker unless the field list already ends
 * with it — the single runtime convention for order-key and index-key
 * field lists.
 */
const withIdTiebreaker = (
  fields: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Option.exists(Array.last(fields), (field) => field === "_id")
    ? fields
    : Array.append(fields, "_id");

// -----------------------------------------------------------------------------
// Convex value ordering
// -----------------------------------------------------------------------------

/**
 * `Order` over Convex values, matching Convex's index ordering — a wrapper
 * around the canonical `compareValues` from `convex/values` (type rank
 * first, then within the type, including UTF-8 string order and NaN
 * bit-level ordering).
 */
export const ValueOrder: Order.Order<Value | undefined> = Order.make(
  (self, that) => Math.sign(compareValues(self, that)) as -1 | 0 | 1,
);

/**
 * `Order` over order keys: lexicographic by `ValueOrder`, then by length —
 * also the ordering of Convex array values.
 */
export const OrderKeyOrder: Order.Order<OrderKey> = Order.Array(ValueOrder);

/** Order of positions in stream order: for `desc`, later keys are smaller. */
const PositionOrder = (order: "asc" | "desc"): Order.Order<OrderKey> =>
  order === "asc" ? OrderKeyOrder : Order.flip(OrderKeyOrder);

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
 * `Stream` — which is honest: generic combinators can't maintain cursor
 * accounting, so the result is consumable but no longer paginable.
 */
export class QueryStream<
  out Doc,
  Key extends ReadonlyArray<string> = ReadonlyArray<string>,
  out E = never,
  out R = never,
> implements Stream.Stream<Doc, E, R> {
  declare readonly _Key: (_: Key) => Key;

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
    readonly order: "asc" | "desc",
    /** Names of the order-key fields (runtime; ends with `_id`). */
    readonly keyFields: ReadonlyArray<string>,
    /** The annotated elements; `None` = read but filtered out. */
    readonly annotated: Stream.Stream<Element<Doc>, E, R>,
    /**
     * Present on leaf streams only: the recipe this stream's underlying
     * Convex query is (re)built from on every run. Derived streams
     * (`merge`, `filterEffect`, …) don't carry one — rebuilding them would
     * also require replaying their combinator, which is the recursive
     * `narrow` architecture of `convex-helpers`, not yet ported.
     */
    readonly reflection?: Reflection,
  ) {}

  toStream(): Stream.Stream<Doc, E, R> {
    return Stream.filterMap(
      this.annotated,
      Filter.fromPredicateOption(([doc, _key]) => doc),
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
// doesn't flag the `defineProperties` return value — an Effect-able — as
// floating.)
const queryStreamPrototype: object = QueryStream.prototype;

Object.defineProperties(queryStreamPrototype, {
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

export type Any = QueryStream<any, ReadonlyArray<string>, any, any>;

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/**
 * The subset of a Convex database reader a leaf stream needs to (re)build
 * its query. (Method syntax keeps the parameter types bivariant, so the
 * strongly-typed readers Confect holds assign to it structurally.)
 */
export interface ReflectionReader {
  query(tableName: string): {
    withIndex(
      indexName: string,
      indexRange?: (q: any) => any,
    ): {
      order(order: "asc" | "desc"): AsyncIterable<unknown>;
    };
  };
}

/**
 * What a leaf stream stores instead of a constructed query: everything
 * needed to rebuild `db.query(table).withIndex(index, range).order(order)`.
 * A Convex query object is one-shot (its first iteration consumes it), so a
 * leaf holds this *recipe* and re-executes it on every run of the stream —
 * the Effect formulation of `convex-helpers`' `reflect()`. It is also the
 * data a future `splitRange`-style `narrow` needs in order to rebuild the
 * leaf with tighter index bounds instead of filtering in memory.
 */
export interface Reflection {
  readonly reader: ReflectionReader;
  readonly tableName: string;
  readonly tableSchema: Schema.Codec<any, any>;
  readonly indexName: string;
  /**
   * All of the index's fields in order, including the `_creationTime`
   * tiebreaker (for `by_id`, just `["_id"]`).
   */
  readonly indexFields: ReadonlyArray<string>;
  /** The recorded range: `eq` pins the first `spec.eqCount` index fields. */
  readonly spec: AnyIndexRangeSpec;
  readonly order: "asc" | "desc";
}

/** Rebuild the Convex ordered query a reflection describes. */
const buildQuery = (reflection: Reflection): AsyncIterable<unknown> =>
  (Array.isReadonlyArrayEmpty(reflection.spec.ops)
    ? reflection.reader
        .query(reflection.tableName)
        .withIndex(reflection.indexName)
    : reflection.reader
        .query(reflection.tableName)
        .withIndex(reflection.indexName, (q) => applyRange(reflection.spec, q))
  ).order(reflection.order);

/**
 * Build a leaf `QueryStream` from reflection data. Each run of the stream
 * rebuilds the Convex query from the reflection; order keys are extracted
 * from the *encoded* document before schema decoding.
 */
export const fromReflection = <Doc>(
  reflection: Reflection,
): QueryStream<Doc, ReadonlyArray<string>, Document.DocumentDecodeError> => {
  // The order key is the index fields that still vary: everything after
  // the eq-pinned prefix of the full index key (the index's fields plus
  // the implicit `_id` tiebreaker, already explicit for `by_id`) — so a
  // fully pinned `by_id` stream has an *empty* order key.
  const keyFields = Array.drop(
    withIdTiebreaker(reflection.indexFields),
    reflection.spec.eqCount,
  );
  const keyPaths = Array.map(keyFields, (field) => String.split(field, "."));

  const annotated = Stream.suspend(() =>
    Stream.fromAsyncIterable(buildQuery(reflection), identity),
  ).pipe(
    Stream.orDie,
    Stream.mapEffect((encoded) =>
      Effect.map(
        Document.decode(reflection.tableName, reflection.tableSchema)(encoded),
        (doc) =>
          [
            Option.some(doc as Doc),
            extractOrderKey(
              encoded as Record.ReadonlyRecord<string, unknown>,
              keyPaths,
            ),
          ] as const,
      ),
    ),
  );

  return new QueryStream(reflection.order, keyFields, annotated, reflection);
};

const extractOrderKey = (
  encoded: Record.ReadonlyRecord<string, unknown>,
  keyPaths: ReadonlyArray<ReadonlyArray<string>>,
): OrderKey =>
  Array.map(keyPaths, (path) =>
    Array.reduce(
      path,
      encoded as unknown,
      (value, segment) =>
        (value as Record.ReadonlyRecord<string, unknown> | undefined)?.[
          segment
        ],
    ),
  ) as OrderKey;

// -----------------------------------------------------------------------------
// Combinators
// -----------------------------------------------------------------------------

const keyFieldsEquivalence = Array.makeEquivalence(Equivalence.String);

/**
 * One input to a k-way merge: its pull effect, the last pulled chunk with a
 * read index into it (an index rather than re-slicing keeps consuming a
 * chunk linear), and whether the underlying stream is exhausted.
 */
interface MergeSource<Doc, E> {
  readonly pull: Pull.Pull<Array.NonEmptyReadonlyArray<Element<Doc>>, E>;
  readonly buffer: ReadonlyArray<Element<Doc>>;
  readonly index: number;
  readonly done: boolean;
}

const makeMergeSource = <Doc, E>(
  pull: MergeSource<Doc, E>["pull"],
  buffer: ReadonlyArray<Element<Doc>>,
  index: number,
  done: boolean,
): MergeSource<Doc, E> => ({ pull, buffer, index, done });

const mergeSourceHead = <Doc, E>(
  source: MergeSource<Doc, E>,
): Option.Option<Element<Doc>> => Array.get(source.buffer, source.index);

/**
 * Refill an exhausted-buffer source from its pull, translating the pull's
 * end-of-stream signal (a `Done` failure) into `done`.
 */
const fillMergeSource = <Doc, E>(
  source: MergeSource<Doc, E>,
): Effect.Effect<MergeSource<Doc, E>, E> =>
  source.done || source.index < source.buffer.length
    ? Effect.succeed(source)
    : source.pull.pipe(
        Effect.map((elements) =>
          makeMergeSource(source.pull, elements, 0, false),
        ),
        Pull.catchDone(() =>
          Effect.succeed(
            makeMergeSource(source.pull, source.buffer, source.index, true),
          ),
        ),
      );

/**
 * One step of the k-way merge as a pure unfold: fill every source, emit the
 * earliest head (ties go to the earliest source, keeping the merge stable),
 * and return the sources with that head consumed. `undefined` when every
 * source is exhausted.
 */
const mergeStep =
  <Doc, E>(position: Order.Order<OrderKey>) =>
  (
    sources: ReadonlyArray<MergeSource<Doc, E>>,
  ): Effect.Effect<
    readonly [Element<Doc>, ReadonlyArray<MergeSource<Doc, E>>] | undefined,
    E
  > =>
    Effect.map(
      Effect.forEach(sources, fillMergeSource, { concurrency: "unbounded" }),
      (filled) => {
        const isEarlier = Order.isLessThan(position);

        const earliest = Array.reduce(
          filled,
          Option.none<readonly [number, Element<Doc>]>(),
          (best, source, index) =>
            Option.match(mergeSourceHead(source), {
              onNone: () => best,
              onSome: (head) =>
                Option.match(best, {
                  onNone: () => Option.some([index, head] as const),
                  onSome: ([, bestElement]) =>
                    isEarlier(head[1], bestElement[1])
                      ? Option.some([index, head] as const)
                      : best,
                }),
            }),
        );

        return Option.getOrUndefined(
          Option.map(
            earliest,
            ([index, element]) =>
              [
                element,
                Array.map(filled, (source, sourceIndex) =>
                  sourceIndex === index
                    ? makeMergeSource(
                        source.pull,
                        source.buffer,
                        source.index + 1,
                        source.done,
                      )
                    : source,
                ),
              ] as const,
          ),
        );
      },
    );

/**
 * Merge streams ordered by the same key into one ordered stream — SQL's
 * `UNION ALL` as a k-way ordered merge. Streams with different order keys
 * are a **type error** (`Key` is invariant); the order *direction* is not
 * part of the type, so a direction mismatch — like a key mismatch from an
 * untyped call site — is caught by the runtime check below.
 */
export const merge = <Doc, Key extends ReadonlyArray<string>, E, R>(
  streams: readonly [
    QueryStream<Doc, Key, E, R>,
    ...ReadonlyArray<QueryStream<Doc, Key, E, R>>,
  ],
): QueryStream<Doc, Key, E, R> => {
  const head = Array.headNonEmpty(streams);
  const incompatible = Array.findFirst(
    Array.tailNonEmpty(streams),
    (stream) =>
      stream.order !== head.order ||
      !keyFieldsEquivalence(stream.keyFields, head.keyFields),
  );
  if (Option.isSome(incompatible)) {
    throw new Error(
      `QueryStream.merge: all streams must share an order and order-key fields (got ${head.order} [${Array.join(head.keyFields, ", ")}] and ${incompatible.value.order} [${Array.join(incompatible.value.keyFields, ", ")}])`,
    );
  }

  const annotated: Stream.Stream<Element<Doc>, E, R> = Stream.unwrap(
    Effect.map(
      Effect.forEach(streams, (stream) => Stream.toPull(stream.annotated)),
      (pulls) =>
        Stream.unfold(
          Array.map(pulls, (pull) =>
            makeMergeSource<Doc, E>(pull, Array.empty(), 0, false),
          ),
          mergeStep<Doc, E>(PositionOrder(head.order)),
        ),
    ),
  );

  return new QueryStream(head.order, head.keyFields, annotated);
};

/**
 * Filter with an effectful predicate. Unlike `Stream.filter`, filtered-out
 * elements still advance cursors, so the result remains paginable. The
 * predicate's `E2`/`R2` flow into the stream's channels.
 */
export const filterEffect = dual<
  <Doc, E2, R2>(
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
  ) => <Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc, Key, E | E2, R | R2>,
  <Doc, Key extends ReadonlyArray<string>, E, R, E2, R2>(
    self: QueryStream<Doc, Key, E, R>,
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
  ) => QueryStream<Doc, Key, E | E2, R | R2>
>(
  2,
  (self, predicate) =>
    new QueryStream(
      self.order,
      self.keyFields,
      Stream.mapEffect(self.annotated, ([doc, key]) =>
        Option.match(doc, {
          onNone: () => Effect.succeed([Option.none<never>(), key] as const),
          onSome: (value) =>
            Effect.map(
              predicate(value),
              (keep) =>
                [keep ? Option.some(value) : Option.none(), key] as const,
            ),
        }),
      ),
    ),
);

/**
 * Transform elements while preserving order keys, so the result remains
 * mergeable and paginable (unlike `Stream.mapEffect`, which degrades to a
 * plain `Stream`). The mapper must not change the ordering semantics.
 */
export const mapEffect = dual<
  <Doc, Doc2, E2, R2>(
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
  ) => <Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc2, Key, E | E2, R | R2>,
  <Doc, Key extends ReadonlyArray<string>, E, R, Doc2, E2, R2>(
    self: QueryStream<Doc, Key, E, R>,
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
  ) => QueryStream<Doc2, Key, E | E2, R | R2>
>(
  2,
  (self, f) =>
    new QueryStream(
      self.order,
      self.keyFields,
      Stream.mapEffect(self.annotated, ([doc, key]) =>
        Option.match(doc, {
          onNone: () => Effect.succeed([Option.none<never>(), key] as const),
          onSome: (value) =>
            Effect.map(
              f(value),
              (mapped) => [Option.some(mapped), key] as const,
            ),
        }),
      ),
    ),
);

/**
 * Restrict a stream to order keys strictly after `after` and at-or-before
 * `until` (in stream order). Prototype: filters in memory. Production would
 * push these bounds down into `withIndex` ranges: a leaf's `reflection`
 * carries everything needed to rebuild it with tighter bounds
 * (`splitRange`-style decomposition of a composite-key bound into a concat
 * of Convex-expressible ranges); composed streams then narrow recursively,
 * as in `convex-helpers`.
 */
export const narrow = dual<
  (bounds: {
    readonly after?: OrderKey | undefined;
    readonly until?: OrderKey | undefined;
  }) => <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc, Key, E, R>,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    bounds: {
      readonly after?: OrderKey | undefined;
      readonly until?: OrderKey | undefined;
    },
  ) => QueryStream<Doc, Key, E, R>
>(
  2,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    bounds: {
      readonly after?: OrderKey | undefined;
      readonly until?: OrderKey | undefined;
    },
  ) => {
    type Narrower = (
      annotated: Stream.Stream<Element<Doc>, E, R>,
    ) => Stream.Stream<Element<Doc>, E, R>;

    const notPast = Order.isLessThanOrEqualTo(PositionOrder(self.order));
    const after = bounds.after;
    const until = bounds.until;

    const dropUpToAfter: Narrower =
      after === undefined
        ? identity
        : Stream.dropWhile(([, key]) => notPast(key, after));
    const takeUpToUntil: Narrower =
      until === undefined
        ? identity
        : Stream.takeWhile(([, key]) => notPast(key, until));

    return new QueryStream(
      self.order,
      self.keyFields,
      pipe(self.annotated, dropUpToAfter, takeUpToUntil),
    );
  },
);

// -----------------------------------------------------------------------------
// Sinks
// -----------------------------------------------------------------------------

export class NotUniqueError extends Schema.TaggedError<NotUniqueError>()(
  "NotUniqueError",
  {},
) {
  override get message(): string {
    return "Expected the query stream to contain at most one document";
  }
}

/** Expect zero or one element; fail with `NotUniqueError` on two or more. */
export const unique = <Doc, Key extends ReadonlyArray<string>, E, R>(
  self: QueryStream<Doc, Key, E, R>,
): Effect.Effect<Option.Option<Doc>, E | NotUniqueError, R> =>
  self.pipe(
    Stream.take(2),
    Stream.runCollect,
    Effect.flatMap((docs) =>
      docs.length >= 2
        ? Effect.fail(new NotUniqueError())
        : Effect.succeed(Array.head(docs)),
    ),
  );

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

const UNDEFINED_SENTINEL = { $undefined: true } as const;

/**
 * Serialize an order key as a cursor. Unlike the built-in Convex pagination
 * cursors (opaque tokens), these carry the raw order-key *values* — they are
 * delivered to clients in `continueCursor`/`splitCursor`, so a stream whose
 * remaining order key includes a sensitive indexed field exposes that
 * field's values at page boundaries. Pin such fields with `eq`, or don't
 * paginate over them publicly, until cursors are made opaque.
 */
export const serializeCursor = (key: OrderKey): string =>
  JSON.stringify(
    Array.map(key, (value) =>
      value === undefined ? UNDEFINED_SENTINEL : convexToJson(value),
    ),
  );

export const deserializeCursor = (cursor: string): OrderKey =>
  Array.map(JSON.parse(cursor) as ReadonlyArray<unknown>, (value) =>
    Predicate.hasProperty(value, "$undefined")
      ? undefined
      : jsonToConvex(value as Parameters<typeof jsonToConvex>[0]),
  );

/**
 * The error a stream-paginated query fails with when a client-supplied
 * cursor is malformed or no longer matches the stream's order-key shape —
 * the `paginationError: "InvalidCursor"` form `convex/react` (and
 * `useStreamPaginatedQuery`) recognize as "reset pagination" rather than an
 * application failure.
 */
const invalidCursorError = () =>
  new ConvexError({ paginationError: "InvalidCursor" });

/**
 * Parse and validate a client-supplied cursor against the stream's
 * order-key arity, throwing the `InvalidCursor` `ConvexError` on any
 * mismatch (malformed JSON, a non-array, or a stale cursor serialized under
 * a different stream shape).
 */
const deserializeCursorChecked = (
  cursor: string,
  keyFieldCount: number,
): OrderKey => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    throw invalidCursorError();
  }
  if (!globalThis.Array.isArray(parsed) || parsed.length !== keyFieldCount) {
    throw invalidCursorError();
  }
  try {
    return Array.map(parsed as ReadonlyArray<unknown>, (value) =>
      Predicate.hasProperty(value, "$undefined")
        ? undefined
        : jsonToConvex(value as Parameters<typeof jsonToConvex>[0]),
    );
  } catch {
    throw invalidCursorError();
  }
};

/** The cursor denoting the end of the stream. */
export const END_CURSOR = "[]";

/**
 * The pagination protocol's request options — `PaginationOptions` from
 * `convex/server`, aliased so the wire protocol has a single source of
 * truth (`@confect/core`'s `PaginationOptions` schema encodes the same
 * shape).
 */
export type PaginateOptions = ConvexPaginationOptions;

/**
 * The pagination protocol's result — `PaginationResult` from
 * `convex/server` (whose `page` is a mutable array type, which is why
 * handlers can return this value where Convex expects its result shape).
 */
export type PaginationResult<Doc> = ConvexPaginationResult<Doc>;

interface PaginateState<Doc> {
  readonly page: Chunk.Chunk<Doc>;
  readonly readKeys: Chunk.Chunk<OrderKey>;
  readonly stopped: boolean;
  readonly hitLimit: boolean;
}

const initialPaginateState = <Doc>(): PaginateState<Doc> => ({
  page: Chunk.empty(),
  readKeys: Chunk.empty(),
  stopped: false,
  hitLimit: false,
});

/** Where a split page divides: the midpoint of the keys read so far. */
const midpointCursor = (readKeys: Chunk.Chunk<OrderKey>): string =>
  serializeCursor(
    Chunk.getUnsafe(readKeys, Math.floor((Chunk.size(readKeys) - 1) / 2)),
  );

/**
 * Consume one page of a stream. Semantics follow
 * `convex-helpers/server/stream`:
 *
 * - `cursor` is exclusive, `endCursor` inclusive; when `endCursor` is set,
 *   `numItems` is ignored and the page runs to the end cursor — the
 *   reactive-adjacency guarantee that keeps concurrent pages gap-free.
 * - Filtered-out elements count as read (for `maximumRowsRead`) and advance
 *   the continue cursor.
 */
export const paginate = dual<
  (
    options: PaginateOptions,
  ) => <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => Effect.Effect<PaginationResult<Doc>, E, R>,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    options: PaginateOptions,
  ) => Effect.Effect<PaginationResult<Doc>, E, R>
>(
  2,
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    options: PaginateOptions,
  ) =>
    Effect.suspend(() => {
      if (options.numItems === 0) {
        if (options.cursor === null) {
          return Effect.die(
            new Error(
              "QueryStream.paginate: numItems of 0 with a null cursor is not supported",
            ),
          );
        }
        return Effect.succeed<PaginationResult<Doc>>({
          page: [],
          isDone: false,
          continueCursor: options.cursor,
        });
      }

      const after = Option.map(Option.fromNullOr(options.cursor), (cursor) =>
        deserializeCursorChecked(cursor, self.keyFields.length),
      );
      const endCursor = Option.fromNullishOr(options.endCursor);
      // An end cursor of `END_CURSOR` pins the page to the end of the
      // stream rather than to a key.
      const pinnedEnd = Option.filter(
        endCursor,
        (cursor) => cursor !== END_CURSOR,
      );
      const until = Option.map(pinnedEnd, (cursor) =>
        deserializeCursorChecked(cursor, self.keyFields.length),
      );
      const narrowed = narrow(self, {
        after: Option.getOrUndefined(after),
        until: Option.getOrUndefined(until),
      });
      // With an endCursor the page runs to it, however many items that is.
      const maxRows = Option.isSome(endCursor) ? undefined : options.numItems;
      const maximumRowsRead = options.maximumRowsRead;

      return Stream.run(
        narrowed.annotated,
        Sink.fold(
          initialPaginateState<Doc>,
          (state) => !state.stopped,
          (state, [doc, key]: Element<Doc>) => {
            const readKeys = Chunk.append(state.readKeys, key);
            const page = Option.match(doc, {
              onNone: () => state.page,
              onSome: (value) => Chunk.append(state.page, value),
            });
            const hitLimit =
              maximumRowsRead !== undefined &&
              Chunk.size(readKeys) >= maximumRowsRead;
            return Effect.succeed<PaginateState<Doc>>({
              page,
              readKeys,
              hitLimit,
              stopped:
                hitLimit ||
                (maxRows !== undefined && Chunk.size(page) >= maxRows),
            });
          },
        ),
      ).pipe(
        Effect.map((state): PaginationResult<Doc> => {
          const page = Chunk.toArray(state.page);
          // `stopped` implies at least one element was read, so the last
          // read key exists exactly when the fold stopped early.
          const stoppedAt = state.stopped
            ? Chunk.last(state.readKeys)
            : Option.none<OrderKey>();
          return Option.match(stoppedAt, {
            onSome: (lastKey) =>
              state.hitLimit
                ? {
                    page,
                    isDone: false,
                    continueCursor: serializeCursor(lastKey),
                    pageStatus: "SplitRequired" as const,
                    splitCursor: midpointCursor(state.readKeys),
                  }
                : {
                    page,
                    isDone: false,
                    continueCursor: serializeCursor(lastKey),
                  },
            // The narrowed stream was exhausted: either we reached the
            // pinned end cursor (more may follow it) or the true end of
            // the stream.
            onNone: () => ({
              page,
              isDone: Option.isNone(pinnedEnd),
              continueCursor: Option.getOrElse(pinnedEnd, () => END_CURSOR),
            }),
          });
        }),
      );
    }),
);
