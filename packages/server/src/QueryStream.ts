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
import type { GenericDocument, FieldTypeFromFieldPath } from "convex/server";
import { convexToJson, jsonToConvex, type Value } from "convex/values";
import { identity, dual, pipe } from "effect/Function";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Array from "effect/Array";
import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as Equivalence from "effect/Equivalence";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
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

// -----------------------------------------------------------------------------
// Convex value ordering
// -----------------------------------------------------------------------------
//
// Convex orders values first by type, then within the type:
// undefined < null < bigint < number < boolean < string < bytes < array
// < object. (NaN subtleties are simplified in this prototype.)

const typeRank = (value: Value | undefined): number =>
  value === undefined
    ? 0
    : value === null
      ? 1
      : Predicate.isBigInt(value)
        ? 2
        : Predicate.isNumber(value)
          ? 3
          : Predicate.isBoolean(value)
            ? 4
            : Predicate.isString(value)
              ? 5
              : value instanceof ArrayBuffer
                ? 6
                : Array.isArray(value)
                  ? 7
                  : 8;

/** `Order` over Convex values, matching Convex's index ordering. */
export const valueOrder: Order.Order<Value | undefined> = Order.make(
  (self, that) => {
    const rankOrdering = Order.number(typeRank(self), typeRank(that));
    if (rankOrdering !== 0) {
      return rankOrdering;
    }
    switch (typeRank(self)) {
      case 0:
      case 1:
        return 0;
      case 2:
        return Order.bigint(self as bigint, that as bigint);
      case 3:
        return Order.number(self as number, that as number);
      case 4:
        return Order.boolean(self as boolean, that as boolean);
      case 5:
        return Order.string(self as string, that as string);
      case 6:
        return bytesOrder(self as ArrayBuffer, that as ArrayBuffer);
      case 7:
        return orderKeyOrder(
          self as ReadonlyArray<Value>,
          that as ReadonlyArray<Value>,
        );
      default:
        return objectOrder(
          self as Record.ReadonlyRecord<string, Value>,
          that as Record.ReadonlyRecord<string, Value>,
        );
    }
  },
);

/**
 * `Order` over order keys: lexicographic by `valueOrder`, then by length —
 * also the ordering of Convex array values.
 */
export const orderKeyOrder: Order.Order<OrderKey> = Order.array(valueOrder);

const bytesOrder: Order.Order<ArrayBuffer> = Order.mapInput(
  Order.array(Order.number),
  (bytes: ArrayBuffer) => Array.fromIterable(new Uint8Array(bytes)),
);

const objectEntryOrder = Order.tuple(Order.string, valueOrder);

const objectOrder: Order.Order<Record.ReadonlyRecord<string, Value>> =
  Order.mapInput(Order.array(objectEntryOrder), (record) =>
    pipe(
      Record.toEntries(record),
      Array.sortBy(Order.mapInput(Order.string, (entry) => entry[0])),
    ),
  );

/** Order of positions in stream order: for `desc`, later keys are smaller. */
const positionOrder = (order: "asc" | "desc"): Order.Order<OrderKey> =>
  order === "asc" ? orderKeyOrder : Order.reverse(orderKeyOrder);

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

  // `effect/Streamable`'s `Class` declaration types the `Stream` variance
  // struct with `never`s and `pipe` as `(): unknown`, which breaks
  // type-parameter inference (`Stream.map(qs, f)` would infer `A = never`)
  // and pipeable overloads — so implement its small protocol directly
  // instead of extending it. These members are `declare`d with their real
  // types and wired up on the prototype below.
  declare readonly [Stream.StreamTypeId]: Stream.Stream.VarianceStruct<
    Doc,
    E,
    R
  >;
  declare readonly pipe: Pipeable["pipe"];

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
    return Stream.filterMap(this.annotated, ([doc, _key]) => doc);
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
  [Stream.StreamTypeId]: { value: streamVariance },
  pipe: {
    // eslint-disable-next-line object-shorthand
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
  readonly tableSchema: Schema.Schema.AnyNoContext;
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
  (Array.isEmptyReadonlyArray(reflection.spec.ops)
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
  // The order key is the index fields that still vary — everything after
  // the eq-pinned prefix — plus the implicit `_id` tiebreaker that makes
  // order keys strictly ordered.
  const remainingFields = Array.drop(
    reflection.indexFields,
    reflection.spec.eqCount,
  );
  const keyFields = Option.exists(
    Array.last(remainingFields),
    (field) => field === "_id",
  )
    ? remainingFields
    : Array.append(remainingFields, "_id");

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
              keyFields,
            ),
          ] as const,
      ),
    ),
  );

  return new QueryStream(reflection.order, keyFields, annotated, reflection);
};

const extractOrderKey = (
  encoded: Record.ReadonlyRecord<string, unknown>,
  keyFields: ReadonlyArray<string>,
): OrderKey =>
  Array.map(keyFields, (fieldPath) =>
    Array.reduce(
      String.split(fieldPath, "."),
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

const keyFieldsEquivalence = Array.getEquivalence(Equivalence.string);

/**
 * One input to a k-way merge: its pull effect, the chunk pulled so far, and
 * whether the underlying stream is exhausted.
 */
interface MergeSource<Doc, E, R> {
  readonly pull: Effect.Effect<Chunk.Chunk<Element<Doc>>, Option.Option<E>, R>;
  readonly buffer: Chunk.Chunk<Element<Doc>>;
  readonly done: boolean;
}

const makeMergeSource = <Doc, E, R>(
  pull: MergeSource<Doc, E, R>["pull"],
  buffer: Chunk.Chunk<Element<Doc>>,
  done: boolean,
): MergeSource<Doc, E, R> => ({ pull, buffer, done });

/**
 * Refill an empty source from its pull, translating the pull's
 * end-of-stream signal (a `None` failure) into `done`.
 */
const fillMergeSource = <Doc, E, R>(
  source: MergeSource<Doc, E, R>,
): Effect.Effect<MergeSource<Doc, E, R>, E, R> =>
  source.done || Chunk.isNonEmpty(source.buffer)
    ? Effect.succeed(source)
    : source.pull.pipe(
        Effect.map(Option.some),
        Effect.catchAll(
          Option.match({
            onNone: () =>
              Effect.succeed(Option.none<Chunk.Chunk<Element<Doc>>>()),
            onSome: (error: E) => Effect.fail(error),
          }),
        ),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.succeed(makeMergeSource(source.pull, source.buffer, true)),
            onSome: (chunk) =>
              fillMergeSource(makeMergeSource(source.pull, chunk, false)),
          }),
        ),
      );

/**
 * One step of the k-way merge as a pure unfold: fill every source, emit the
 * earliest head (ties go to the earliest source, keeping the merge stable),
 * and return the sources with that head consumed. `None` when every source
 * is exhausted.
 */
const mergeStep =
  <Doc, E, R>(position: Order.Order<OrderKey>) =>
  (
    sources: ReadonlyArray<MergeSource<Doc, E, R>>,
  ): Effect.Effect<
    Option.Option<
      readonly [Element<Doc>, ReadonlyArray<MergeSource<Doc, E, R>>]
    >,
    E,
    R
  > =>
    Effect.map(Effect.forEach(sources, fillMergeSource), (filled) => {
      const isEarlier = Order.lessThan(position);

      const earliest = Array.reduce(
        filled,
        Option.none<readonly [number, Element<Doc>]>(),
        (best, source, index) =>
          Option.match(Chunk.head(source.buffer), {
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

      return Option.map(
        earliest,
        ([index, element]) =>
          [
            element,
            Array.modify(filled, index, (source) =>
              makeMergeSource(
                source.pull,
                Chunk.drop(source.buffer, 1),
                source.done,
              ),
            ),
          ] as const,
      );
    });

/**
 * Merge streams ordered by the same key into one ordered stream — SQL's
 * `UNION ALL` as a k-way ordered merge. Streams with different order keys or
 * directions are a **type error** (`Key` is invariant); the runtime check
 * below only guards untyped call sites.
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

  const annotated: Stream.Stream<Element<Doc>, E, R> = Stream.unwrapScoped(
    Effect.map(
      Effect.forEach(streams, (stream) => Stream.toPull(stream.annotated)),
      (pulls) =>
        Stream.unfoldEffect(
          Array.map(pulls, (pull) =>
            makeMergeSource<Doc, E, R>(pull, Chunk.empty(), false),
          ),
          mergeStep<Doc, E, R>(positionOrder(head.order)),
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

    const notPast = Order.lessThanOrEqualTo(positionOrder(self.order));
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
    Effect.flatMap((chunk) =>
      Chunk.size(chunk) >= 2
        ? Effect.fail(new NotUniqueError())
        : Effect.succeed(Chunk.head(chunk)),
    ),
  );

// -----------------------------------------------------------------------------
// Pagination
// -----------------------------------------------------------------------------

const UNDEFINED_SENTINEL = { $undefined: true } as const;

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

/** The cursor denoting the end of the stream. */
export const END_CURSOR = "[]";

export interface PaginateOptions {
  readonly numItems: number;
  readonly cursor: string | null;
  readonly endCursor?: string | null | undefined;
  readonly id?: number | undefined;
  readonly maximumRowsRead?: number | undefined;
  readonly maximumBytesRead?: number | undefined;
}

export interface PaginationResult<Doc> {
  page: Doc[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string;
  pageStatus?: "SplitRecommended" | "SplitRequired";
}

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

      const after = Option.map(
        Option.fromNullable(options.cursor),
        deserializeCursor,
      );
      const endCursor = Option.fromNullable(options.endCursor);
      // An end cursor of `END_CURSOR` pins the page to the end of the
      // stream rather than to a key.
      const pinnedEnd = Option.filter(
        endCursor,
        (cursor) => cursor !== END_CURSOR,
      );
      const until = Option.map(pinnedEnd, deserializeCursor);
      const narrowed = narrow(self, {
        after: Option.getOrUndefined(after),
        until: Option.getOrUndefined(until),
      });
      // With an endCursor the page runs to it, however many items that is.
      const maxRows = Option.isSome(endCursor) ? undefined : options.numItems;
      const maximumRowsRead = options.maximumRowsRead;

      return Stream.runFoldWhile(
        narrowed.annotated,
        initialPaginateState<Doc>(),
        (state) => !state.stopped,
        (state, [doc, key]): PaginateState<Doc> => {
          const readKeys = Chunk.append(state.readKeys, key);
          const page = Option.match(doc, {
            onNone: () => state.page,
            onSome: (value) => Chunk.append(state.page, value),
          });
          const hitLimit =
            maximumRowsRead !== undefined &&
            Chunk.size(readKeys) >= maximumRowsRead;
          return {
            page,
            readKeys,
            hitLimit,
            stopped:
              hitLimit ||
              (maxRows !== undefined && Chunk.size(page) >= maxRows),
          };
        },
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
                    splitCursor: serializeCursor(
                      Chunk.unsafeGet(
                        state.readKeys,
                        Math.floor((Chunk.size(state.readKeys) - 1) / 2),
                      ),
                    ),
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
