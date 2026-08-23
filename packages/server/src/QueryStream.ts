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
 * - No `maximumBytesRead` accounting; NaN ordering subtleties are skipped.
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
import * as Match from "effect/Match";
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

/** Replay recorded range ops onto Convex's real `IndexRangeBuilder`. */
const applyOps = (ops: ReadonlyArray<RangeOp>, q: any): any =>
  Array.reduce(ops, q, (builder, op) => builder[op._tag](op.field, op.value));

/** Replay a recorded range spec onto Convex's real `IndexRangeBuilder`. */
export const applyRange = (spec: AnyIndexRangeSpec, q: any): any =>
  applyOps(spec.ops, q);

// -----------------------------------------------------------------------------
// Convex value ordering
// -----------------------------------------------------------------------------
//
// Convex orders values first by type, then within the type:
// undefined < null < bigint < number < boolean < string < bytes < array
// < object. (NaN subtleties are simplified in this prototype.)

type ValueType =
  | "undefined"
  | "null"
  | "bigint"
  | "number"
  | "boolean"
  | "string"
  | "bytes"
  | "array"
  | "object";

const valueType = (value: Value | undefined): ValueType =>
  value === undefined
    ? "undefined"
    : value === null
      ? "null"
      : Predicate.isBigInt(value)
        ? "bigint"
        : Predicate.isNumber(value)
          ? "number"
          : Predicate.isBoolean(value)
            ? "boolean"
            : Predicate.isString(value)
              ? "string"
              : value instanceof ArrayBuffer
                ? "bytes"
                : Array.isArray(value)
                  ? "array"
                  : "object";

const valueTypeRank: Record.ReadonlyRecord<ValueType, number> = {
  undefined: 0,
  null: 1,
  bigint: 2,
  number: 3,
  boolean: 4,
  string: 5,
  bytes: 6,
  array: 7,
  object: 8,
};

const byValueType: Order.Order<Value | undefined> = Order.mapInput(
  Order.number,
  (value: Value | undefined) => valueTypeRank[valueType(value)],
);

const withinValueType: Order.Order<Value | undefined> = Order.make(
  (self, that) =>
    // Only consulted when `byValueType` ties, so `self` and `that` have the
    // same `ValueType` and the per-branch casts of `that` are safe.
    Match.value(valueType(self)).pipe(
      Match.whenOr("undefined", "null", () => 0 as const),
      Match.when("bigint", () => Order.bigint(self as bigint, that as bigint)),
      Match.when("number", () => Order.number(self as number, that as number)),
      Match.when("boolean", () =>
        Order.boolean(self as boolean, that as boolean),
      ),
      Match.when("string", () => Order.string(self as string, that as string)),
      Match.when("bytes", () =>
        bytesOrder(self as ArrayBuffer, that as ArrayBuffer),
      ),
      Match.when("array", () =>
        orderKeyOrder(
          self as ReadonlyArray<Value>,
          that as ReadonlyArray<Value>,
        ),
      ),
      Match.when("object", () =>
        objectOrder(
          self as Record.ReadonlyRecord<string, Value>,
          that as Record.ReadonlyRecord<string, Value>,
        ),
      ),
      Match.exhaustive,
    ),
);

/** `Order` over Convex values, matching Convex's index ordering. */
export const valueOrder: Order.Order<Value | undefined> = Order.combine(
  byValueType,
  withinValueType,
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

// -----------------------------------------------------------------------------
// Key bounds and cuts
// -----------------------------------------------------------------------------
//
// A bound's key may be a *prefix* of the full key: bounding by `["a"]` means
// bounding by the whole family of keys that start with `"a"`. To compare
// bounds and keys uniformly, each is modelled as a "cut" — a position
// *between* keys: the `predecessor` cut of a prefix sits just before every
// key extending it, the `successor` cut just after, and an `exact` cut is a
// full key itself. (This is `convex-helpers`' `compareKeys` model.)

/** One side of a range: a (possibly prefix) key and whether it's included. */
export interface KeyBound {
  readonly key: OrderKey;
  readonly inclusive: boolean;
}

/**
 * Bounds over a stream's order key, in *ascending key space* (`narrow`
 * converts from stream space, where `desc` reverses which end is which).
 */
export interface KeyBounds {
  readonly lower: Option.Option<KeyBound>;
  readonly upper: Option.Option<KeyBound>;
}

/**
 * Bounds in *full index-key space*: `eq`-pinned values appear as a shared
 * prefix of both keys (`splitRange` re-derives them as `eq` constraints).
 * An empty key bounds nothing.
 */
export interface IndexBounds {
  readonly lower: KeyBound;
  readonly upper: KeyBound;
}

type CutKind = "predecessor" | "exact" | "successor";

interface KeyCut {
  readonly key: OrderKey;
  readonly kind: CutKind;
}

const cutKindRank: Record.ReadonlyRecord<CutKind, number> = {
  predecessor: 0,
  exact: 1,
  successor: 2,
};

const keyCutOrder: Order.Order<KeyCut> = Order.make((self, that) => {
  const minLength = Math.min(self.key.length, that.key.length);
  const prefixOrdering = orderKeyOrder(
    Array.take(self.key, minLength),
    Array.take(that.key, minLength),
  );
  if (prefixOrdering !== 0) {
    return prefixOrdering;
  }
  if (self.key.length === that.key.length) {
    return Order.number(cutKindRank[self.kind], cutKindRank[that.kind]);
  }
  // One key is a proper prefix of the other. The shorter cut sits just
  // before (`predecessor`) or just after (`successor`) *every* key
  // extending its prefix — the longer one included. (`exact` cuts are
  // always full keys, so an `exact` cut is never the shorter one here.)
  const selfIsShorter = self.key.length < that.key.length;
  const shorter = selfIsShorter ? self : that;
  const shorterOrdering = shorter.kind === "predecessor" ? -1 : 1;
  return selfIsShorter ? shorterOrdering : (-shorterOrdering as -1 | 1);
});

const exactCut = (key: OrderKey): KeyCut => ({ key, kind: "exact" });

const lowerCut = (bound: KeyBound): KeyCut => ({
  key: bound.key,
  kind: bound.inclusive ? "predecessor" : "successor",
});

const upperCut = (bound: KeyBound): KeyCut => ({
  key: bound.key,
  kind: bound.inclusive ? "successor" : "predecessor",
});

/** The stricter (later) of two lower bounds. */
const tightestLower = (self: KeyBound, that: KeyBound): KeyBound =>
  Order.greaterThan(keyCutOrder)(lowerCut(that), lowerCut(self)) ? that : self;

/** The stricter (earlier) of two upper bounds. */
const tightestUpper = (self: KeyBound, that: KeyBound): KeyBound =>
  Order.lessThan(keyCutOrder)(upperCut(that), upperCut(self)) ? that : self;

/** Order of positions in stream order: for `desc`, later keys are smaller. */
const positionOrder = (order: "asc" | "desc"): Order.Order<OrderKey> =>
  order === "asc" ? orderKeyOrder : Order.reverse(orderKeyOrder);

// -----------------------------------------------------------------------------
// Range splitting
// -----------------------------------------------------------------------------
//
// Convex index ranges have the shape `eq(f1) … eq(fn), gt/gte(fm)?,
// lt/lte(fm)?` — every field pinned except the last, which may carry two
// inequalities. An arbitrary range between two index keys therefore
// decomposes into a *sequence* of Convex-expressible ranges (the port of
// `convex-helpers`' `splitRange`): e.g. `(1, 2, 3) < key <= (1, 3, 2)` over
// fields `(f1, f2, f3)` becomes
//
//   1. eq(f1, 1), eq(f2, 2), gt(f3, 3)
//   2. eq(f1, 1), gt(f2, 2), lt(f2, 3)
//   3. eq(f1, 1), eq(f2, 3), lte(f3, 2)

type BoundTag = "gt" | "gte" | "lt" | "lte";

/** Dropping a bound key's last component bounds by the remaining prefix — exclusively. */
const excludePrefix = (tag: BoundTag): BoundTag =>
  tag === "gt" || tag === "gte" ? "gt" : "lt";

/**
 * Peel a bound key down to a single component: each peeled entry becomes an
 * exact-prefix segment, the final (shortest) entry feeds the middle range.
 */
const peelBound = (
  key: OrderKey,
  tag: BoundTag,
): {
  readonly peeled: ReadonlyArray<readonly [OrderKey, BoundTag]>;
  readonly final: readonly [OrderKey, BoundTag];
} =>
  key.length <= 1
    ? { peeled: [], final: [key, tag] }
    : pipe(
        peelBound(Array.dropRight(key, 1), excludePrefix(tag)),
        ({ final, peeled }) => ({
          peeled: Array.prepend(peeled, [key, tag] as const),
          final,
        }),
      );

/** `eq` every component of `key` but the last, which gets the bound tag. */
const rangeOpsFor = (
  prefixOps: ReadonlyArray<RangeOp>,
  fields: ReadonlyArray<string>,
  key: OrderKey,
  tag: BoundTag,
): ReadonlyArray<RangeOp> =>
  Option.match(Array.last(key), {
    onNone: () => prefixOps,
    onSome: (lastValue) =>
      pipe(
        Array.zip(fields, Array.dropRight(key, 1)),
        Array.map(([field, value]): RangeOp => ({ _tag: "eq", field, value })),
        (eqOps) =>
          Array.appendAll(
            Array.appendAll(prefixOps, eqOps),
            Array.of<RangeOp>({
              _tag: tag,
              field: fields[key.length - 1]!,
              value: lastValue,
            }),
          ),
      ),
  });

/**
 * Decompose the range between `bounds.lower` and `bounds.upper` (over the
 * full index-key `fields`, `_id` tiebreaker included) into a sequence of
 * Convex-expressible ranges, ordered for the given direction.
 */
const splitRange = (
  fields: ReadonlyArray<string>,
  order: "asc" | "desc",
  bounds: IndexBounds,
): ReadonlyArray<ReadonlyArray<RangeOp>> => {
  if (
    Order.greaterThan(keyCutOrder)(
      lowerCut(bounds.lower),
      upperCut(bounds.upper),
    )
  ) {
    return [];
  }

  const commonLength = pipe(
    Array.zip(bounds.lower.key, bounds.upper.key),
    Array.takeWhile(
      ([lowerValue, upperValue]) => valueOrder(lowerValue, upperValue) === 0,
    ),
  ).length;
  const prefixOps = pipe(
    Array.zip(Array.take(fields, commonLength), bounds.lower.key),
    Array.map(([field, value]): RangeOp => ({ _tag: "eq", field, value })),
  );
  const restFields = Array.drop(fields, commonLength);

  const lower = peelBound(
    Array.drop(bounds.lower.key, commonLength),
    bounds.lower.inclusive ? "gte" : "gt",
  );
  const upper = peelBound(
    Array.drop(bounds.upper.key, commonLength),
    bounds.upper.inclusive ? "lte" : "lt",
  );

  const startRanges = Array.map(lower.peeled, ([key, tag]) =>
    rangeOpsFor(prefixOps, restFields, key, tag),
  );
  const endRanges = Array.reverse(
    Array.map(upper.peeled, ([key, tag]) =>
      rangeOpsFor(prefixOps, restFields, key, tag),
    ),
  );

  const [lowerFinalKey, lowerFinalTag] = lower.final;
  const [upperFinalKey, upperFinalTag] = upper.final;
  const middleRange =
    Array.isNonEmptyReadonlyArray(lowerFinalKey) &&
    Array.isNonEmptyReadonlyArray(upperFinalKey)
      ? Array.appendAll(prefixOps, [
          {
            _tag: lowerFinalTag,
            field: restFields[0]!,
            value: Array.headNonEmpty(lowerFinalKey),
          },
          {
            _tag: upperFinalTag,
            field: restFields[0]!,
            value: Array.headNonEmpty(upperFinalKey),
          },
        ] as ReadonlyArray<RangeOp>)
      : Array.isNonEmptyReadonlyArray(lowerFinalKey)
        ? rangeOpsFor(prefixOps, restFields, lowerFinalKey, lowerFinalTag)
        : rangeOpsFor(prefixOps, restFields, upperFinalKey, upperFinalTag);

  const ranges = Array.appendAll(
    Array.appendAll(startRanges, Array.of(middleRange)),
    endRanges,
  );
  return order === "desc" ? Array.reverse(ranges) : ranges;
};

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
     * Convex query is (re)built from on every run, with its effective
     * `bounds`. Derived streams (`merge`, `filterEffect`, …) don't carry
     * one — they narrow via `narrowWith` instead.
     */
    readonly reflection?: Reflection,
    /**
     * How this stream narrows itself to tighter order-key bounds: leaves
     * rebuild their Convex queries with the bounds pushed into `withIndex`
     * ranges, and derived streams narrow their inputs and re-apply their
     * combinator. Absent (e.g. on externally constructed streams), `narrow`
     * falls back to filtering the annotated stream in memory.
     */
    readonly narrowWith?: (bounds: KeyBounds) => QueryStream<Doc, Key, E, R>,
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
  /**
   * The effective full-index-key bounds of this leaf. Absent on
   * construction (derived from `spec`); present — and tighter — on leaves
   * produced by `narrow` pushing cursor bounds down.
   */
  readonly bounds?: IndexBounds;
}

/** Fold a range spec's recorded ops into full-index-key bounds. */
const boundsFromSpec = (spec: AnyIndexRangeSpec): IndexBounds =>
  Array.reduce(
    spec.ops,
    {
      lower: { key: Array.empty<Value | undefined>(), inclusive: true },
      upper: { key: Array.empty<Value | undefined>(), inclusive: true },
    } as IndexBounds,
    (bounds, op) =>
      Match.value(op._tag).pipe(
        Match.when("eq", (): IndexBounds => ({
          lower: {
            key: Array.append(bounds.lower.key, op.value),
            inclusive: bounds.lower.inclusive,
          },
          upper: {
            key: Array.append(bounds.upper.key, op.value),
            inclusive: bounds.upper.inclusive,
          },
        })),
        Match.whenOr("gt", "gte", (tag): IndexBounds => ({
          lower: {
            key: Array.append(bounds.lower.key, op.value),
            inclusive: tag === "gte",
          },
          upper: bounds.upper,
        })),
        Match.whenOr("lt", "lte", (tag): IndexBounds => ({
          lower: bounds.lower,
          upper: {
            key: Array.append(bounds.upper.key, op.value),
            inclusive: tag === "lte",
          },
        })),
        Match.exhaustive,
      ),
  );

const intersectIndexBounds = (
  self: IndexBounds,
  that: IndexBounds,
): IndexBounds => ({
  lower: tightestLower(self.lower, that.lower),
  upper: tightestUpper(self.upper, that.upper),
});

/**
 * Build a leaf `QueryStream` from reflection data. Each run of the stream
 * rebuilds the Convex queries from the reflection — the leaf's bounds
 * decomposed into Convex-expressible index ranges via `splitRange` — and
 * order keys are extracted from the *encoded* document before schema
 * decoding.
 */
export const fromReflection = <Doc>(
  reflection: Reflection,
): QueryStream<Doc, ReadonlyArray<string>, Document.DocumentDecodeError> =>
  makeLeaf(
    reflection,
    reflection.bounds === undefined
      ? boundsFromSpec(reflection.spec)
      : intersectIndexBounds(
          boundsFromSpec(reflection.spec),
          reflection.bounds,
        ),
  );

const makeLeaf = <Doc>(
  reflection: Reflection,
  bounds: IndexBounds,
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

  // Bounds and range splitting work in full index-key space, which appends
  // the implicit `_id` tiebreaker (already explicit for `by_id`). Convex
  // accepts range constraints on `_creationTime` and `_id` even though its
  // index types don't advertise them.
  const fullIndexFields = Option.exists(
    Array.last(reflection.indexFields),
    (field) => field === "_id",
  )
    ? reflection.indexFields
    : Array.append(reflection.indexFields, "_id");
  // `eq`-pinned values form a shared prefix of both bound keys.
  const eqValues = Array.take(bounds.lower.key, reflection.spec.eqCount);
  const segments = splitRange(fullIndexFields, reflection.order, bounds);

  const annotated = Stream.fromIterable(segments).pipe(
    Stream.flatMap((segment) =>
      Stream.suspend(() =>
        Stream.fromAsyncIterable(
          reflection.reader
            .query(reflection.tableName)
            .withIndex(reflection.indexName, (q) => applyOps(segment, q))
            .order(reflection.order),
          identity,
        ),
      ),
    ),
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

  const toFullKeySpace = (bound: KeyBound): KeyBound => ({
    key: Array.appendAll(eqValues, bound.key),
    inclusive: bound.inclusive,
  });

  return new QueryStream(
    reflection.order,
    keyFields,
    annotated,
    { ...reflection, bounds },
    (keyBounds) =>
      makeLeaf(reflection, {
        lower: Option.match(keyBounds.lower, {
          onNone: () => bounds.lower,
          onSome: (bound) => tightestLower(bounds.lower, toFullKeySpace(bound)),
        }),
        upper: Option.match(keyBounds.upper, {
          onNone: () => bounds.upper,
          onSome: (bound) => tightestUpper(bounds.upper, toFullKeySpace(bound)),
        }),
      }),
  );
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

  return new QueryStream(
    head.order,
    head.keyFields,
    annotated,
    undefined,
    // Narrowing a merge narrows every branch; the bounds are in the shared
    // order-key space, so each branch converts them to its own index-key
    // space itself.
    (keyBounds) =>
      merge([
        narrowByKeyBounds(head, keyBounds),
        ...Array.map(Array.tailNonEmpty(streams), (stream) =>
          narrowByKeyBounds(stream, keyBounds),
        ),
      ]),
  );
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
>(2, (self, predicate) => filterEffectImpl(self, predicate));

const filterEffectImpl = <Doc, Key extends ReadonlyArray<string>, E, R, E2, R2>(
  self: QueryStream<Doc, Key, E, R>,
  predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
): QueryStream<Doc, Key, E | E2, R | R2> =>
  new QueryStream(
    self.order,
    self.keyFields,
    Stream.mapEffect(self.annotated, ([doc, key]) =>
      Option.match(doc, {
        onNone: () => Effect.succeed([Option.none<never>(), key] as const),
        onSome: (value) =>
          Effect.map(
            predicate(value),
            (keep) => [keep ? Option.some(value) : Option.none(), key] as const,
          ),
      }),
    ),
    undefined,
    (keyBounds) =>
      filterEffectImpl(narrowByKeyBounds(self, keyBounds), predicate),
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
>(2, (self, f) => mapEffectImpl(self, f));

const mapEffectImpl = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  E2,
  R2,
>(
  self: QueryStream<Doc, Key, E, R>,
  f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
): QueryStream<Doc2, Key, E | E2, R | R2> =>
  new QueryStream(
    self.order,
    self.keyFields,
    Stream.mapEffect(self.annotated, ([doc, key]) =>
      Option.match(doc, {
        onNone: () => Effect.succeed([Option.none<never>(), key] as const),
        onSome: (value) =>
          Effect.map(f(value), (mapped) => [Option.some(mapped), key] as const),
      }),
    ),
    undefined,
    (keyBounds) => mapEffectImpl(narrowByKeyBounds(self, keyBounds), f),
  );

/**
 * A join: for each outer document, stream the documents of the inner stream
 * produced by `f`, ordered by (outer key, then inner key) — SQL's `LATERAL`
 * join shape, `flatMap` on `convex-helpers` streams.
 *
 * `options.innerKey` is the order key shared by *every* inner stream —
 * checked against `f`'s return type, so a mismatched literal is a type
 * error; each produced stream is also validated at runtime (a defect on
 * mismatch, like `merge`).
 *
 * Cursor accounting: an outer document whose inner stream is empty — or
 * that was filtered out upstream — still contributes one filtered element
 * whose inner key components are `null`s, so cursors advance past the cost
 * of reading it. Narrowing splits bounds at the outer/inner seam: the outer
 * stream is narrowed by the bounds' outer components, and the inner bound
 * applies only to the *boundary* outer row (the row whose outer key equals
 * the bound's outer prefix) — other rows' inner streams run in full. (This
 * deliberately deviates from `convex-helpers`, which narrows every row's
 * inner stream and so drops legitimate elements from non-boundary rows.)
 */
export const flatMap = dual<
  <Doc, Doc2, InnerKey extends ReadonlyArray<string>, E2, R2>(
    f: (doc: Doc) => QueryStream<Doc2, InnerKey, E2, R2>,
    options: { readonly innerKey: NoInfer<InnerKey> },
  ) => <Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc2, readonly [...Key, ...InnerKey], E | E2, R | R2>,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    InnerKey extends ReadonlyArray<string>,
    E2,
    R2,
  >(
    self: QueryStream<Doc, Key, E, R>,
    f: (doc: Doc) => QueryStream<Doc2, InnerKey, E2, R2>,
    options: { readonly innerKey: NoInfer<InnerKey> },
  ) => QueryStream<Doc2, readonly [...Key, ...InnerKey], E | E2, R | R2>
>(3, (self, f, options) =>
  makeFlatMap(
    self,
    f,
    // Runtime inner key fields follow the same convention as leaves: the
    // type-level key plus the implicit `_id` tiebreaker.
    Option.exists(Array.last(options.innerKey), (field) => field === "_id")
      ? options.innerKey
      : Array.append(options.innerKey, "_id"),
    {},
  ),
);

/** Inner bounds that apply only to the outer row whose key is `outer`. */
interface InnerRefinement {
  readonly outer: OrderKey;
  readonly inner: KeyBound;
}

interface InnerRefinements {
  readonly lower?: InnerRefinement | undefined;
  readonly upper?: InnerRefinement | undefined;
}

/** Of two lower refinements, the one at the later boundary row wins. */
const combineLowerRefinements = (
  existing: InnerRefinement | undefined,
  incoming: InnerRefinement | undefined,
): InnerRefinement | undefined =>
  existing === undefined
    ? incoming
    : incoming === undefined
      ? existing
      : Order.greaterThan(orderKeyOrder)(existing.outer, incoming.outer)
        ? existing
        : Order.lessThan(orderKeyOrder)(existing.outer, incoming.outer)
          ? incoming
          : {
              outer: existing.outer,
              inner: tightestLower(existing.inner, incoming.inner),
            };

/** Of two upper refinements, the one at the earlier boundary row wins. */
const combineUpperRefinements = (
  existing: InnerRefinement | undefined,
  incoming: InnerRefinement | undefined,
): InnerRefinement | undefined =>
  existing === undefined
    ? incoming
    : incoming === undefined
      ? existing
      : Order.lessThan(orderKeyOrder)(existing.outer, incoming.outer)
        ? existing
        : Order.greaterThan(orderKeyOrder)(existing.outer, incoming.outer)
          ? incoming
          : {
              outer: existing.outer,
              inner: tightestUpper(existing.inner, incoming.inner),
            };

const makeFlatMap = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  InnerKey extends ReadonlyArray<string>,
  E2,
  R2,
>(
  self: QueryStream<Doc, Key, E, R>,
  f: (doc: Doc) => QueryStream<Doc2, InnerKey, E2, R2>,
  innerKeyFields: ReadonlyArray<string>,
  refinements: InnerRefinements,
): QueryStream<Doc2, readonly [...Key, ...InnerKey], E | E2, R | R2> => {
  const outerLength = self.keyFields.length;
  const keyFields = Array.appendAll(self.keyFields, innerKeyFields);
  // The inner key of an outer document that contributes no inner elements
  // (filtered out, or an empty inner stream).
  const nullPadding: OrderKey = Array.makeBy(innerKeyFields.length, () => null);

  const validated = (
    inner: QueryStream<Doc2, InnerKey, E2, R2>,
  ): QueryStream<Doc2, InnerKey, E2, R2> => {
    if (inner.order !== self.order) {
      throw new Error(
        `QueryStream.flatMap: inner stream order (${inner.order}) differs from the outer stream's (${self.order})`,
      );
    }
    if (!keyFieldsEquivalence(inner.keyFields, innerKeyFields)) {
      throw new Error(
        `QueryStream.flatMap: inner stream order-key fields ([${Array.join(inner.keyFields, ", ")}]) differ from innerKey ([${Array.join(innerKeyFields, ", ")}])`,
      );
    }
    return inner;
  };

  const innerBoundsFor = (outerKey: OrderKey): KeyBounds => ({
    lower:
      refinements.lower !== undefined &&
      orderKeyOrder(outerKey, refinements.lower.outer) === 0
        ? Option.some(refinements.lower.inner)
        : Option.none(),
    upper:
      refinements.upper !== undefined &&
      orderKeyOrder(outerKey, refinements.upper.outer) === 0
        ? Option.some(refinements.upper.inner)
        : Option.none(),
  });

  const markerStream = (
    outerKey: OrderKey,
    innerBounds: KeyBounds,
  ): Stream.Stream<Element<Doc2>> =>
    admittedByLower(innerBounds.lower)(nullPadding) &&
    admittedByUpper(innerBounds.upper)(nullPadding)
      ? Stream.succeed([
          Option.none<Doc2>(),
          Array.appendAll(outerKey, nullPadding),
        ] as const)
      : Stream.empty;

  const annotated: Stream.Stream<
    Element<Doc2>,
    E | E2,
    R | R2
  > = self.annotated.pipe(
    Stream.flatMap(([outerDoc, outerKey]) => {
      const innerBounds = innerBoundsFor(outerKey);
      return Option.match(outerDoc, {
        onNone: () => markerStream(outerKey, innerBounds),
        onSome: (doc) =>
          narrowByKeyBounds(validated(f(doc)), innerBounds).annotated.pipe(
            Stream.map(
              ([innerDoc, innerKey]) =>
                [innerDoc, Array.appendAll(outerKey, innerKey)] as const,
            ),
            Stream.orElseIfEmptyStream(() =>
              markerStream(outerKey, innerBounds),
            ),
          ),
      });
    }),
  );

  const split = (
    bound: Option.Option<KeyBound>,
  ): {
    readonly outer: Option.Option<KeyBound>;
    readonly refinement: InnerRefinement | undefined;
  } =>
    Option.match(bound, {
      onNone: () => ({ outer: Option.none(), refinement: undefined }),
      onSome: ({ inclusive, key }) =>
        key.length <= outerLength
          ? { outer: Option.some({ key, inclusive }), refinement: undefined }
          : {
              // The boundary outer row must be included so its inner
              // stream can be narrowed by the bound's inner components.
              outer: Option.some({
                key: Array.take(key, outerLength),
                inclusive: true,
              }),
              refinement: {
                outer: Array.take(key, outerLength),
                inner: { key: Array.drop(key, outerLength), inclusive },
              },
            },
    });

  return new QueryStream(
    self.order,
    keyFields,
    annotated,
    undefined,
    (bounds) => {
      const lower = split(bounds.lower);
      const upper = split(bounds.upper);
      return makeFlatMap(
        narrowByKeyBounds(self, { lower: lower.outer, upper: upper.outer }),
        f,
        innerKeyFields,
        {
          lower: combineLowerRefinements(refinements.lower, lower.refinement),
          upper: combineUpperRefinements(refinements.upper, upper.refinement),
        },
      );
    },
  );
};

/**
 * Keep the first document for each distinct value of a *prefix* of the
 * order key — a loose index scan: after a group's first document, the
 * underlying stream is narrowed past the entire group, so each group costs
 * one index seek instead of a scan.
 *
 * `fields` must be a prefix of the stream's order key — enforced at the
 * type level (`Key` must extend `readonly [...Fields, ...rest]`) and
 * validated at runtime.
 *
 * Filtered-out elements pass through (still advancing cursors) without
 * claiming their group, so the first *present* document of each group is
 * kept. As with `convex-helpers`, prefer applying `filterEffect` *after*
 * `distinct`: narrowing a distinct stream truncates bounds to the distinct
 * prefix, so a cursor that lands on a filtered element before its group's
 * first present document resumes at the next group.
 */
export const distinct = dual<
  <const Fields extends ReadonlyArray<string>>(
    fields: Fields,
  ) => <Doc, Key extends readonly [...Fields, ...ReadonlyArray<string>], E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc, Key, E, R>,
  <
    const Fields extends ReadonlyArray<string>,
    Doc,
    Key extends readonly [...Fields, ...ReadonlyArray<string>],
    E,
    R,
  >(
    self: QueryStream<Doc, Key, E, R>,
    fields: Fields,
  ) => QueryStream<Doc, Key, E, R>
>(2, (self, fields) => {
  if (
    !keyFieldsEquivalence(fields, Array.take(self.keyFields, fields.length))
  ) {
    throw new Error(
      `QueryStream.distinct: fields ([${Array.join(fields, ", ")}]) must be a prefix of the stream's order-key fields ([${Array.join(self.keyFields, ", ")}])`,
    );
  }
  return makeDistinct(self, fields.length);
});

/**
 * Re-key a stream: declare that its order key should be regarded as `key`,
 * a position-for-position relabeling of the order-key fields (the trailing
 * `_id` tiebreaker keeps its name). Order keys are *values*, so relabeling
 * changes only the names used for compatibility validation — the element
 * order is untouched, and narrowing passes bounds through to the
 * underlying stream unchanged. Use it to make streams from different
 * indexes or tables mergeable when their keys align positionally; the
 * caller asserts the *semantic* alignment of the relabeled fields.
 *
 * (This is `convex-helpers`' `.orderBy()`. There it may also drop
 * equality-pinned prefix fields from the key — Confect's remaining-field
 * order keys already drop those at the leaf.)
 *
 * `key` must have as many fields as the stream's order key, enforced at
 * the type level via tuple length. One caveat: a `flatMap` result's
 * runtime key carries interior `_id` tiebreakers that its type-level key
 * omits, so relabeling one is rejected by the runtime length validation.
 */
export const orderBy = dual<
  <const NewKey extends ReadonlyArray<string>>(
    key: NewKey,
  ) => <
    Doc,
    Key extends ReadonlyArray<string> & {
      readonly length: NewKey["length"];
    },
    E,
    R,
  >(
    self: QueryStream<Doc, Key, E, R>,
  ) => QueryStream<Doc, Types.Mutable<NewKey>, E, R>,
  <
    const NewKey extends ReadonlyArray<string>,
    Doc,
    Key extends ReadonlyArray<string> & {
      readonly length: NewKey["length"];
    },
    E,
    R,
  >(
    self: QueryStream<Doc, Key, E, R>,
    key: NewKey,
  ) => QueryStream<Doc, Types.Mutable<NewKey>, E, R>
>(2, (self, key) => orderByImpl(self, key));

const orderByImpl = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  NewKey extends ReadonlyArray<string>,
>(
  self: QueryStream<Doc, Key, E, R>,
  key: NewKey,
): QueryStream<Doc, Types.Mutable<NewKey>, E, R> => {
  const keyFields = Option.exists(Array.last(key), (field) => field === "_id")
    ? key
    : Array.append(key, "_id");
  if (keyFields.length !== self.keyFields.length) {
    throw new Error(
      `QueryStream.orderBy: key ([${Array.join(key, ", ")}]) must have as many fields as the stream's order key ([${Array.join(self.keyFields, ", ")}])`,
    );
  }
  return new QueryStream(
    self.order,
    keyFields,
    self.annotated,
    undefined,
    // Bounds are positional values, so they apply to the underlying
    // stream as-is.
    (bounds) => orderByImpl(narrowByKeyBounds(self, bounds), key),
  );
};

const makeDistinct = <Doc, Key extends ReadonlyArray<string>, E, R>(
  self: QueryStream<Doc, Key, E, R>,
  distinctLength: number,
): QueryStream<Doc, Key, E, R> => {
  /** Bounds that skip past the group of the given key, in stream order. */
  const skipGroupBounds = (key: OrderKey): KeyBounds => {
    const pastGroup: KeyBound = {
      key: Array.take(key, distinctLength),
      inclusive: false,
    };
    return self.order === "asc"
      ? { lower: Option.some(pastGroup), upper: Option.none() }
      : { lower: Option.none(), upper: Option.some(pastGroup) };
  };

  // Each step reads one group: everything up to and including the group's
  // first present document (filtered elements pass through), then the next
  // step continues from a stream narrowed past the whole group.
  const annotated: Stream.Stream<Element<Doc>, E, R> = Stream.unfoldChunkEffect(
    Option.some(self),
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: (current) =>
        current.annotated.pipe(
          Stream.takeUntil(([doc, _key]) => Option.isSome(doc)),
          Stream.runCollect,
          Effect.map((chunk) =>
            Chunk.isNonEmpty(chunk)
              ? Option.some([
                  chunk,
                  pipe(Chunk.lastNonEmpty(chunk), ([doc, key]) =>
                    Option.isSome(doc)
                      ? Option.some(
                          narrowByKeyBounds(current, skipGroupBounds(key)),
                        )
                      : // The stream ended on a filtered element: no
                        // present document remains.
                        Option.none<QueryStream<Doc, Key, E, R>>(),
                  ),
                ] as const)
              : Option.none(),
          ),
        ),
    }),
  );

  // Narrowing truncates bound keys to the distinct prefix (as in
  // `convex-helpers`): a cursor at a group's kept document resumes at the
  // next group, and an inclusive bound re-reads its whole group so the
  // group's first present document is re-found.
  const truncated = (bound: Option.Option<KeyBound>): Option.Option<KeyBound> =>
    Option.map(bound, ({ inclusive, key }) => ({
      key: Array.take(key, distinctLength),
      inclusive,
    }));

  return new QueryStream(
    self.order,
    self.keyFields,
    annotated,
    undefined,
    (bounds) =>
      makeDistinct(
        narrowByKeyBounds(self, {
          lower: truncated(bounds.lower),
          upper: truncated(bounds.upper),
        }),
        distinctLength,
      ),
  );
};

/**
 * Restrict a stream to order keys strictly after `after` and at-or-before
 * `until` (in stream order). Bounds are pushed down through the stream's
 * structure via `narrowWith`: leaves rebuild their Convex queries with the
 * bounds decomposed into `withIndex` ranges (`splitRange`), and derived
 * streams narrow their inputs and re-apply their combinator. Streams
 * without a `narrowWith` (constructed externally) fall back to filtering
 * the annotated stream in memory.
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
    const after = Option.map(
      Option.fromNullable(bounds.after),
      (key): KeyBound => ({ key, inclusive: false }),
    );
    const until = Option.map(
      Option.fromNullable(bounds.until),
      (key): KeyBound => ({ key, inclusive: true }),
    );
    // Stream space → ascending key space: for `desc`, "after" bounds from
    // above and "until" from below.
    const keyBounds: KeyBounds =
      self.order === "asc"
        ? { lower: after, upper: until }
        : { lower: until, upper: after };
    return narrowByKeyBounds(self, keyBounds);
  },
);

const narrowByKeyBounds = <Doc, Key extends ReadonlyArray<string>, E, R>(
  self: QueryStream<Doc, Key, E, R>,
  bounds: KeyBounds,
): QueryStream<Doc, Key, E, R> =>
  Option.isNone(bounds.lower) && Option.isNone(bounds.upper)
    ? self
    : self.narrowWith !== undefined
      ? self.narrowWith(bounds)
      : narrowInMemory(self, bounds);

/** Whether a key sits after the lower bound (always, when unbounded). */
const admittedByLower =
  (lower: Option.Option<KeyBound>) =>
  (key: OrderKey): boolean =>
    Option.match(lower, {
      onNone: () => true,
      onSome: (bound) => keyCutOrder(exactCut(key), lowerCut(bound)) > 0,
    });

/** Whether a key sits before the upper bound (always, when unbounded). */
const admittedByUpper =
  (upper: Option.Option<KeyBound>) =>
  (key: OrderKey): boolean =>
    Option.match(upper, {
      onNone: () => true,
      onSome: (bound) => keyCutOrder(exactCut(key), upperCut(bound)) < 0,
    });

/** The fallback for streams that don't know how to rebuild themselves. */
const narrowInMemory = <Doc, Key extends ReadonlyArray<string>, E, R>(
  self: QueryStream<Doc, Key, E, R>,
  bounds: KeyBounds,
): QueryStream<Doc, Key, E, R> => {
  type Narrower = (
    annotated: Stream.Stream<Element<Doc>, E, R>,
  ) => Stream.Stream<Element<Doc>, E, R>;

  const aboveLower = admittedByLower(bounds.lower);
  const belowUpper = admittedByUpper(bounds.upper);

  const dropOutOfRange: Narrower =
    self.order === "asc"
      ? Stream.dropWhile(([, key]) => !aboveLower(key))
      : Stream.dropWhile(([, key]) => !belowUpper(key));
  const takeInRange: Narrower =
    self.order === "asc"
      ? Stream.takeWhile(([, key]) => belowUpper(key))
      : Stream.takeWhile(([, key]) => aboveLower(key));

  return new QueryStream(
    self.order,
    self.keyFields,
    pipe(self.annotated, dropOutOfRange, takeInRange),
  );
};

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

/**
 * `page` stays a *mutable array type* (its property is still `readonly`):
 * paginated query handlers return this value where the Convex pagination
 * protocol's result type is expected — `PaginationResult` from
 * `convex/server` and the `@confect/core` `PaginationResult` schema type
 * (`Schema.mutable(Schema.Array(...))`) both declare `page` mutable, and a
 * `ReadonlyArray` is not assignable to a mutable array. Readonly
 * *properties* assign to mutable ones, so everything else is `readonly`.
 */
export interface PaginationResult<Doc> {
  readonly page: Doc[];
  readonly isDone: boolean;
  readonly continueCursor: string;
  readonly splitCursor?: string;
  readonly pageStatus?: "SplitRecommended" | "SplitRequired";
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
