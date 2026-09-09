/**
 * EXPERIMENTAL — a stream-first querying API for Confect.
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
 * result set — `SELECT * FROM table ORDER BY <index fields>` — and each
 * operation is a clause around it.
 *
 * Known limitations (all called out in the design doc):
 *
 * - `maximumBytesRead` charges each document's estimated size (Convex's
 *   `getDocumentSize`), as `convex-helpers` does — not the exact bytes the
 *   backend bills; NaN ordering subtleties are skipped.
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
  getDocumentSize,
  jsonToConvex,
  type Value,
} from "convex/values";
import { identity, dual, pipe } from "effect/Function";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Array from "effect/Array";
import type * as Channel from "effect/Channel";
import * as Chunk from "effect/Chunk";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Equivalence from "effect/Equivalence";
import * as Filter from "effect/Filter";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import * as Pull from "effect/Pull";
import * as Ref from "effect/Ref";
import type * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import * as SynchronizedRef from "effect/SynchronizedRef";
import type * as Types from "effect/Types";
import * as Document from "./Document";

/**
 * @experimental
 */
export const TypeId = "~@confect/server/QueryStream";
/**
 * @experimental
 */
export type TypeId = typeof TypeId;

// -----------------------------------------------------------------------------
// Order keys
// -----------------------------------------------------------------------------

/**
 * The values of a document's order-key fields: the index fields that still
 * vary after equality pinning, plus the trailing `_id` tiebreaker. `undefined`
 * appears for optional fields that are absent.
 *
 * @experimental
 */
export type OrderKey = ReadonlyArray<Value | undefined>;

/**
 * The direction a stream is ordered in. Tracked covariantly in the type: a
 * stream of a known direction is also a stream of `"asc" | "desc"`, the
 * class default, so annotations that omit the direction accept every
 * stream. Combining streams of different known directions — `merge`, or a
 * `flatMap` whose inner streams run the other way — is a type error; a
 * direction chosen at runtime types as the union, and the runtime check
 * catches what the types can't see (`merge` throws when the streams are
 * combined, `flatMap` fails when the join runs).
 *
 * @experimental
 */
export type OrderDirection = "asc" | "desc";

/**
 * The opposite of a direction; a runtime-chosen direction stays the union.
 *
 * @experimental
 */
export type Flip<Direction extends OrderDirection> = Direction extends "asc"
  ? "desc"
  : "asc";

const flipDirection = <Direction extends OrderDirection>(
  direction: Direction,
): Flip<Direction> => (direction === "asc" ? "desc" : "asc") as Flip<Direction>;

/**
 * An element of the annotated stream: the decoded document (`None` when the
 * element was read but filtered out — it still advances cursors) paired with
 * its order key.
 *
 * @experimental
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

/**
 * @experimental
 */
export const RangeSpecTypeId = "~@confect/server/QueryStream/IndexRangeSpec";
/**
 * @experimental
 */
export type RangeSpecTypeId = typeof RangeSpecTypeId;

/**
 * @experimental
 */
export type RangeOp = {
  readonly _tag: "eq" | "gt" | "gte" | "lt" | "lte";
  readonly field: string;
  readonly value: Value | undefined;
};

/**
 * The result of applying a range callback: the recorded operations, plus a
 * phantom `Remaining` — the index fields not consumed by `eq` pinning.
 *
 * @experimental
 */
export interface IndexRangeSpec<out Fields extends ReadonlyArray<string>> {
  readonly [RangeSpecTypeId]: {
    readonly _Remaining: Types.Covariant<Fields>;
  };
  readonly eqCount: number;
  readonly ops: ReadonlyArray<RangeOp>;
}

/**
 * @experimental
 */
export type AnyIndexRangeSpec = IndexRangeSpec<ReadonlyArray<string>>;

/**
 * @experimental
 */
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
 *
 * @experimental
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

/**
 * After `gt`/`gte`, only an upper bound on the same field may follow.
 *
 * @experimental
 */
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

/**
 * The initial builder handed to a range callback.
 *
 * @experimental
 */
export const rangeBuilder = <
  ConvexDoc extends GenericDocument,
  Fields extends ReadonlyArray<string>,
>(): RangeBuilder<ConvexDoc, Fields> =>
  makeRangeBuilder(0, []) as unknown as RangeBuilder<ConvexDoc, Fields>;

/** Replay recorded range ops onto Convex's real `IndexRangeBuilder`. */
const applyOps = (ops: ReadonlyArray<RangeOp>, q: any): any =>
  Array.reduce(ops, q, (builder, op) => builder[op._tag](op.field, op.value));

/**
 * Replay a recorded range spec onto Convex's real `IndexRangeBuilder`.
 *
 * @experimental
 */
export const applyRange = (spec: AnyIndexRangeSpec, q: any): any =>
  applyOps(spec.ops, q);

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

/**
 * The position of the `_id` tiebreaker that {@link withIdTiebreaker} added
 * to `fields` (none when the fields already ended with `_id`, as `by_id`'s
 * do — that `_id` is part of the type-level key).
 */
const appendedTiebreaker = (
  fields: ReadonlyArray<string>,
  withTiebreaker: ReadonlyArray<string>,
): ReadonlyArray<number> =>
  withTiebreaker.length === fields.length ? [] : [withTiebreaker.length - 1];

/** The order-key fields the type-level key names: all but the tiebreakers. */
const visibleKeyFields = (self: {
  readonly keyFields: ReadonlyArray<string>;
  readonly tiebreakers: ReadonlyArray<number>;
}): ReadonlyArray<string> =>
  Array.filter(
    self.keyFields,
    (_field, index) => !Array.contains(self.tiebreakers, index),
  );

/**
 * The runtime length of the order-key prefix that covers the first
 * `visibleLength` type-visible fields — including any tiebreakers that
 * sit between them.
 */
const runtimePrefixLength = (
  self: {
    readonly keyFields: ReadonlyArray<string>;
    readonly tiebreakers: ReadonlyArray<number>;
  },
  visibleLength: number,
): number =>
  visibleLength === 0
    ? 0
    : Option.getOrThrowWith(
        Array.get(
          Array.filter(
            Array.makeBy(self.keyFields.length, identity),
            (index) => !Array.contains(self.tiebreakers, index),
          ),
          visibleLength - 1,
        ),
        () =>
          new Error(
            `QueryStream: prefix length ${visibleLength} exceeds the order key ([${Array.join(self.keyFields, ", ")}])`,
          ),
      ) + 1;

// -----------------------------------------------------------------------------
// Convex value ordering
// -----------------------------------------------------------------------------

/**
 * `Order` over Convex values, matching Convex's index ordering — a wrapper
 * around the canonical `compareValues` from `convex/values` (type rank
 * first, then within the type, including UTF-8 string order and NaN
 * bit-level ordering).
 *
 * @experimental
 */
export const ValueOrder: Order.Order<Value | undefined> = Order.make(
  (self, that) => Math.sign(compareValues(self, that)) as -1 | 0 | 1,
);

/**
 * `Order` over order keys: lexicographic by `ValueOrder`, then by length —
 * also the ordering of Convex array values.
 *
 * @experimental
 */
export const OrderKeyOrder: Order.Order<OrderKey> = Order.Array(ValueOrder);

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

/**
 * One side of a range: a (possibly prefix) key and whether it's included.
 *
 * @experimental
 */
export interface KeyBound {
  readonly key: OrderKey;
  readonly inclusive: boolean;
}

/**
 * Bounds over a stream's order key, in *ascending key space* (`narrow`
 * converts from stream space, where `desc` reverses which end is which).
 *
 * @experimental
 */
export interface KeyBounds {
  readonly lower: Option.Option<KeyBound>;
  readonly upper: Option.Option<KeyBound>;
}

/**
 * Bounds in *full index-key space*: `eq`-pinned values appear as a shared
 * prefix of both keys (`splitRange` re-derives them as `eq` constraints).
 * An empty key bounds nothing.
 *
 * @experimental
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

const KeyCutOrder: Order.Order<KeyCut> = Order.make((self, that) => {
  const minLength = Math.min(self.key.length, that.key.length);
  const prefixOrdering = OrderKeyOrder(
    Array.take(self.key, minLength),
    Array.take(that.key, minLength),
  );
  if (prefixOrdering !== 0) {
    return prefixOrdering;
  }
  if (self.key.length === that.key.length) {
    return Order.Number(cutKindRank[self.kind], cutKindRank[that.kind]);
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
  Order.isGreaterThan(KeyCutOrder)(lowerCut(that), lowerCut(self))
    ? that
    : self;

/** The stricter (earlier) of two upper bounds. */
const tightestUpper = (self: KeyBound, that: KeyBound): KeyBound =>
  Order.isLessThan(KeyCutOrder)(upperCut(that), upperCut(self)) ? that : self;

const combineKeyBound = (
  self: Option.Option<KeyBound>,
  that: Option.Option<KeyBound>,
  combine: (self: KeyBound, that: KeyBound) => KeyBound,
): Option.Option<KeyBound> =>
  Option.match(self, {
    onNone: () => that,
    onSome: (first) =>
      Option.some(
        Option.match(that, {
          onNone: () => first,
          onSome: (second) => combine(first, second),
        }),
      ),
  });

/** Order of positions in stream order: for `desc`, later keys are smaller. */
const PositionOrder = (order: OrderDirection): Order.Order<OrderKey> =>
  order === "asc" ? OrderKeyOrder : Order.flip(OrderKeyOrder);

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
  order: OrderDirection,
  bounds: IndexBounds,
): ReadonlyArray<ReadonlyArray<RangeOp>> => {
  // Equal cuts are an empty range too: e.g. lower exclusive at `k` and
  // upper inclusive at `k` — the half-open (k, k] — both cut at
  // successor(k).
  if (
    Order.isGreaterThanOrEqualTo(KeyCutOrder)(
      lowerCut(bounds.lower),
      upperCut(bounds.upper),
    )
  ) {
    return [];
  }

  const commonLength = pipe(
    Array.zip(bounds.lower.key, bounds.upper.key),
    Array.takeWhile(
      ([lowerValue, upperValue]) => ValueOrder(lowerValue, upperValue) === 0,
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
    Array.isReadonlyArrayNonEmpty(lowerFinalKey) &&
    Array.isReadonlyArrayNonEmpty(upperFinalKey)
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
      : Array.isReadonlyArrayNonEmpty(lowerFinalKey)
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
 *
 * @experimental
 */
export class QueryStream<
  out Doc,
  Key extends ReadonlyArray<string> = ReadonlyArray<string>,
  out E = never,
  out R = never,
  out Direction extends OrderDirection = OrderDirection,
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
    readonly narrowWith?: (
      bounds: KeyBounds,
    ) => QueryStream<Doc, Key, E, R, Direction>,
    /**
     * Positions in `keyFields` of the implicit `_id` tiebreakers the
     * type-level `Key` omits: normally the trailing one, plus — on a
     * `flatMap` result — the outer key's interior one. Combinators that
     * relate the type-level key to the runtime key (`renameKey`, `distinct`)
     * skip over them. Defaults to the trailing `_id`, if any.
     */
    readonly tiebreakers: ReadonlyArray<number> = appendedTiebreaker(
      Array.dropRight(keyFields, 1),
      keyFields,
    ),
    /**
     * How this stream runs in the opposite direction: leaves rebuild their
     * Convex queries with the other `order`, and derived streams reverse
     * their inputs and re-apply their combinator. Distinct streams retain
     * their representative-selection order. Absent on externally
     * constructed streams without a reversal recipe; `reverse` then throws.
     */
    readonly reverseWith?: () => QueryStream<Doc, Key, E, R, Flip<Direction>>,
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
 * Whether `u` is a `QueryStream` — as opposed to the plain `Stream` that a
 * generic `Stream.*` combinator turns one into (in SQL terms: whether the
 * value still knows its `ORDER BY`, and so can still be combined and
 * paginated).
 *
 * @experimental
 */
export const isQueryStream = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * An empty query stream with the given order key and direction — the
 * `merge` input for a dynamic list of streams that may turn out empty.
 *
 * In SQL terms: the empty relation — `SELECT ... WHERE false` with the same
 * `ORDER BY` — so it merges with, and paginates like, any stream of that
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
    <const Key extends ReadonlyArray<string>>(
      key: Key,
    ): QueryStream<Doc, Types.Mutable<Key>, never, never, "asc">;
    <const Key extends ReadonlyArray<string>, Direction extends OrderDirection>(
      key: Key,
      order: Direction,
    ): QueryStream<Doc, Types.Mutable<Key>, never, never, Direction>;
  } =>
  (key: ReadonlyArray<string>, order: OrderDirection = "asc") => {
    const keyFields = withIdTiebreaker(key);
    const tiebreakers = appendedTiebreaker(key, keyFields);
    // `any` in the key and direction slots: the overloads above assign the
    // literal types the caller supplied.
    const make = (
      direction: OrderDirection,
    ): QueryStream<Doc, any, never, never, any> =>
      new QueryStream(
        direction,
        keyFields,
        Stream.empty,
        undefined,
        // Narrowing nothing is nothing, and so is reversing it.
        () => make(direction),
        tiebreakers,
        () => make(flipDirection(direction)),
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
 * leaf holds this *recipe* and re-executes it on every run of the stream —
 * the Effect formulation of `convex-helpers`' `reflect()`. It is also the
 * data a future `splitRange`-style `narrow` needs in order to rebuild the
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
  readonly indexFields: ReadonlyArray<string>;
  /** The recorded range: `eq` pins the first `spec.eqCount` index fields. */
  readonly spec: AnyIndexRangeSpec;
  readonly order: Direction;
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
 * Build a leaf `QueryStream` from reflection data.
 *
 * In SQL terms: an index range scan — `SELECT * FROM table WHERE <range>
 * ORDER BY <index fields> [DESC]`; the order key is the `ORDER BY` columns
 * left after the equality predicates. The value is a reusable description
 * of a query rather than a result.
 *
 * Each run rebuilds the Convex queries from the reflection — the leaf's
 * bounds decomposed into Convex-expressible index ranges via `splitRange`
 * — and order keys are extracted from the *encoded* document before schema
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
  ReadonlyArray<string>,
  Document.DocumentDecodeError,
  never,
  Direction
> =>
  makeLeaf(
    reflection,
    reflection.bounds === undefined
      ? boundsFromSpec(reflection.spec)
      : intersectIndexBounds(
          boundsFromSpec(reflection.spec),
          reflection.bounds,
        ),
  );

const makeLeaf = <Doc, Direction extends OrderDirection>(
  reflection: Reflection<Direction>,
  bounds: IndexBounds,
): QueryStream<
  Doc,
  ReadonlyArray<string>,
  Document.DocumentDecodeError,
  never,
  Direction
> => {
  // Bounds and range splitting work in full index-key space: the index's
  // fields plus the implicit `_id` tiebreaker (already explicit for
  // `by_id`). Convex accepts range constraints on `_creationTime` and
  // `_id` even though its index types don't advertise them.
  const fullIndexFields = withIdTiebreaker(reflection.indexFields);
  // The order key is the index fields that still vary: everything after
  // the eq-pinned prefix. Deriving it from the full index key keeps the
  // invariant fullIndexFields = eq prefix ++ keyFields — in particular a
  // fully pinned `by_id` stream has an *empty* order key, not a re-appended
  // `_id`.
  const keyFields = Array.drop(fullIndexFields, reflection.spec.eqCount);
  // The appended `_id` (if any) is the key's one type-invisible position —
  // unless pinning consumed the whole key.
  const tiebreakers = Array.map(
    Array.filter(
      appendedTiebreaker(reflection.indexFields, fullIndexFields),
      (position) => position >= reflection.spec.eqCount,
    ),
    (position) => position - reflection.spec.eqCount,
  );
  const keyPaths = Array.map(keyFields, (field) => String.split(field, "."));
  // `eq`-pinned values form a shared prefix of both bound keys.
  const eqValues = Array.take(bounds.lower.key, reflection.spec.eqCount);
  const segments = splitRange(fullIndexFields, reflection.order, bounds);

  const encodedDocuments = Stream.fromIterable(segments).pipe(
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
  );

  const charged = Stream.fromPull(
    Effect.gen(function* () {
      const maybeBudget = yield* Effect.service(ReadBudget);
      const pull = yield* Stream.toPull(encodedDocuments);
      return Option.match(maybeBudget, {
        onNone: () => pull,
        onSome: (budget) =>
          SynchronizedRef.modifyEffect(budget.state, (state) =>
            Effect.gen(function* () {
              if (isBudgetExhausted(budget, state)) {
                return [
                  Option.none(),
                  { ...state, status: BudgetStatus.Stopped() },
                ] as const;
              }
              const documents = yield* pull;
              return [
                Option.some(documents),
                {
                  ...state,
                  rows: state.rows + documents.length,
                  bytes: Option.match(budget.maximumBytesRead, {
                    onNone: () => state.bytes,
                    onSome: () =>
                      Array.reduce(
                        documents,
                        state.bytes,
                        (bytes, document) =>
                          bytes + getDocumentSize(document as GenericDocument),
                      ),
                  }),
                },
              ] as const;
            }),
          ).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Cause.done(),
                onSome: Effect.succeed,
              }),
            ),
          ),
      });
    }),
  ).pipe(Stream.scoped);

  const annotated = charged.pipe(
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
    tiebreakers,
    // Bounds live in ascending key space, so the reversed leaf keeps them.
    () =>
      makeLeaf(
        { ...reflection, order: flipDirection(reflection.order) },
        bounds,
      ),
  );
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

type SourceStatus = Data.TaggedEnum<{
  Ready: {};
  Exhausted: {};
  BudgetLimited: {};
}>;

const SourceStatus = Data.taggedEnum<SourceStatus>();

/**
 * One input to a k-way merge: its pull effect, the last pulled chunk with a
 * read index into it (an index rather than re-slicing keeps consuming a
 * chunk linear), and its ready, exhausted, or budget-limited status.
 */
interface MergeSource<Doc, E> {
  readonly pull: Pull.Pull<Array.NonEmptyReadonlyArray<Element<Doc>>, E>;
  readonly buffer: ReadonlyArray<Element<Doc>>;
  readonly index: number;
  readonly status: SourceStatus;
}

const makeMergeSource = <Doc, E>(
  pull: MergeSource<Doc, E>["pull"],
  buffer: ReadonlyArray<Element<Doc>>,
  index: number,
  status: SourceStatus,
): MergeSource<Doc, E> => ({ pull, buffer, index, status });

const mergeSourceHead = <Doc, E>(
  source: MergeSource<Doc, E>,
): Option.Option<Element<Doc>> => Array.get(source.buffer, source.index);

/**
 * Refill an exhausted-buffer source from its pull, translating the pull's
 * end-of-stream signal into a source status, retaining budget-limited stops.
 */
const fillMergeSource = <Doc, E>(
  source: MergeSource<Doc, E>,
): Effect.Effect<MergeSource<Doc, E>, E> =>
  SourceStatus.$match(source.status, {
    Ready: () =>
      source.index < source.buffer.length
        ? Effect.succeed(source)
        : source.pull.pipe(
            Effect.map((elements) =>
              makeMergeSource(source.pull, elements, 0, SourceStatus.Ready()),
            ),
            Pull.catchDone(() =>
              Effect.gen(function* () {
                const maybeBudget = yield* Effect.service(ReadBudget);
                const status = yield* Option.match(maybeBudget, {
                  onNone: () => Effect.succeed(SourceStatus.Exhausted()),
                  onSome: (budget) =>
                    Effect.map(SynchronizedRef.get(budget.state), (state) =>
                      BudgetStatus.$match(state.status, {
                        Active: () => SourceStatus.Exhausted(),
                        Stopped: () => SourceStatus.BudgetLimited(),
                      }),
                    ),
                });
                return makeMergeSource(
                  source.pull,
                  source.buffer,
                  source.index,
                  status,
                );
              }),
            ),
          ),
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
  <Doc, E>(position: Order.Order<OrderKey>) =>
  (
    sources: ReadonlyArray<MergeSource<Doc, E>>,
  ): Effect.Effect<
    readonly [Element<Doc>, ReadonlyArray<MergeSource<Doc, E>>] | undefined,
    E
  > =>
    Effect.gen(function* () {
      const budget = yield* Effect.service(ReadBudget);
      const filled = yield* Effect.forEach(sources, fillMergeSource, {
        concurrency: Option.match(budget, {
          onNone: () => "unbounded" as const,
          onSome: () => 1,
        }),
      });
      if (
        filled.some((source) =>
          SourceStatus.$is("BudgetLimited")(source.status),
        )
      )
        return undefined;
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
                      source.status,
                    )
                  : source,
              ),
            ] as const,
        ),
      );
    });

/**
 * Merge streams ordered by the same key into one ordered stream.
 *
 * In SQL terms: `UNION ALL` of queries that share an `ORDER BY`, with the
 * result still in that order (a planner's merge append). It is an ordered
 * merge — the step of merge sort that combines sorted runs, always emitting
 * the smallest next key (the largest, descending) — not `Stream.merge`,
 * which interleaves inputs in arrival order.
 *
 * Streams with different order keys are a **type error** (`Key` is
 * invariant), and so are different directions: the first stream fixes the
 * direction and each later one must be assignable to it. A mismatch the
 * types can't see — a runtime-chosen direction, or an untyped call site —
 * throws here, when the streams are combined.
 *
 * @experimental
 */
export const merge = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, Key, E, R, Direction>,
    ...ReadonlyArray<QueryStream<Doc, Key, E, R, NoInfer<Direction>>>,
  ],
): QueryStream<Doc, Key, E, R, Direction> => {
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
  return mergeUnchecked(streams);
};

/**
 * `merge` without the compatibility check — for re-merging branches that
 * were validated when the merge was built (narrowing never changes a
 * branch's order or key fields).
 */
const mergeUnchecked = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  streams: readonly [
    QueryStream<Doc, Key, E, R, Direction>,
    ...ReadonlyArray<QueryStream<Doc, Key, E, R, Direction>>,
  ],
): QueryStream<Doc, Key, E, R, Direction> => {
  const head = Array.headNonEmpty(streams);
  const annotated: Stream.Stream<Element<Doc>, E, R> = Stream.unwrap(
    Effect.map(
      Effect.forEach(streams, (stream) => Stream.toPull(stream.annotated)),
      (pulls) =>
        Stream.unfold(
          Array.map(pulls, (pull) =>
            makeMergeSource<Doc, E>(
              pull,
              Array.empty(),
              0,
              SourceStatus.Ready(),
            ),
          ),
          mergeStep<Doc, E>(PositionOrder(head.order)),
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
      mergeUnchecked([
        narrowByKeyBounds(head, keyBounds),
        ...Array.map(Array.tailNonEmpty(streams), (stream) =>
          narrowByKeyBounds(stream, keyBounds),
        ),
      ]),
    head.tiebreakers,
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
  Key extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
  f: (doc: Doc) => Option.Option<Doc2>,
): QueryStream<Doc2, Key, E, R, Direction> =>
  new QueryStream(
    self.order,
    self.keyFields,
    Stream.map(
      self.annotated,
      ([doc, key]) => [Option.flatMap(doc, f), key] as const,
    ),
    undefined,
    (keyBounds) => transform(narrowByKeyBounds(self, keyBounds), f),
    self.tiebreakers,
    () => transform(reverse(self), f),
  );

/** The effectful {@link transform}. */
const transformEffect = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Doc2,
  E2,
  R2,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
  f: (doc: Doc) => Effect.Effect<Option.Option<Doc2>, E2, R2>,
  options: EffectOptions | undefined,
): QueryStream<Doc2, Key, E | E2, R | R2, Direction> =>
  new QueryStream(
    self.order,
    self.keyFields,
    Stream.mapEffect(
      self.annotated,
      ([doc, key]) =>
        Option.match(doc, {
          onNone: () => Effect.succeed([Option.none<Doc2>(), key] as const),
          onSome: (value) =>
            Effect.map(f(value), (mapped) => [mapped, key] as const),
        }),
      // Order is preserved at any concurrency: elements are emitted in
      // input order however their effects finish.
      { concurrency: options?.concurrency },
    ),
    undefined,
    (keyBounds) =>
      transformEffect(narrowByKeyBounds(self, keyBounds), f, options),
    self.tiebreakers,
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
 * In SQL terms: a `WHERE` on any column, evaluated after the index scan —
 * rows it rejects were still read, and filtered-out elements still advance
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
  ) => <
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc, Key, E, R, Direction>,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    predicate: (doc: Doc) => boolean,
  ) => QueryStream<Doc, Key, E, R, Direction>
>(2, (self, predicate) =>
  transform(self, (doc) => (predicate(doc) ? Option.some(doc) : Option.none())),
);

/**
 * Filter with an effectful predicate.
 *
 * In SQL terms: a `WHERE` whose predicate runs a subquery — `WHERE EXISTS
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
  ) => <
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc, Key, E | E2, R | R2, Direction>,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    E2,
    R2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    predicate: (doc: Doc) => Effect.Effect<boolean, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc, Key, E | E2, R | R2, Direction>
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
 * In SQL terms: the `SELECT` list — projecting or computing columns while
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
  ) => <
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc2, Key, E, R, Direction>,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    f: (doc: Doc) => Doc2,
  ) => QueryStream<Doc2, Key, E, R, Direction>
>(2, (self, f) => transform(self, (doc) => Option.some(f(doc))));

/**
 * Transform elements with an effectful function while preserving order
 * keys.
 *
 * In SQL terms: a scalar subquery in the `SELECT` list — a computed column
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
  ) => <
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc2, Key, E | E2, R | R2, Direction>,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    E2,
    R2,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    f: (doc: Doc) => Effect.Effect<Doc2, E2, R2>,
    options?: EffectOptions,
  ) => QueryStream<Doc2, Key, E | E2, R | R2, Direction>
>(
  (args) => isQueryStream(args[0]),
  (self, f, options) =>
    transformEffect(self, (doc) => Effect.map(f(doc), Option.some), options),
);

/**
 * A join: for each outer document, stream the documents of the inner stream
 * produced by `f`, ordered by (outer key, then inner key).
 *
 * In SQL terms: `CROSS JOIN LATERAL` (`CROSS APPLY`): the inner query can
 * reference the outer row, and the result is ordered by the outer key, then
 * the inner key. An outer row with no inner rows contributes none — an
 * inner join — unless `options.onEmpty` is given, which makes it `LEFT JOIN
 * LATERAL`: the row still appears once, with `onEmpty(outer)` standing in
 * for the `NULL` inner columns. Inner streams run sequentially — each outer
 * element's is drained before the next outer element's begins — and the
 * order key is extended by the inner key (`flatMap` on `convex-helpers`
 * streams).
 *
 * `options.innerKey` is the order key shared by *every* inner stream —
 * checked against `f`'s return type, so a mismatched literal is a type
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
 * Cursor accounting: an outer document whose inner stream is empty — or
 * that was filtered out upstream — still contributes one filtered element
 * whose inner key components are `null`s, so cursors advance past the cost
 * of reading it. Narrowing splits bounds at the outer/inner seam: the outer
 * stream is narrowed by the bounds' outer components, and the inner bound
 * applies only to the *boundary* outer row (the row whose outer key equals
 * the bound's outer prefix) — other rows' inner streams run in full. (This
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
    InnerKey extends ReadonlyArray<string>,
    E2,
    R2,
    Direction extends OrderDirection,
    Doc3 = never,
  >(
    f: (doc: Doc) => QueryStream<Doc2, InnerKey, E2, R2, Direction>,
    options: {
      readonly innerKey: NoInfer<InnerKey>;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => <Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<
    Doc2 | Doc3,
    readonly [...Key, ...InnerKey],
    E | E2,
    R | R2,
    Direction
  >,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Doc2,
    InnerKey extends ReadonlyArray<string>,
    E2,
    R2,
    Direction extends OrderDirection,
    Doc3 = never,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    f: (doc: Doc) => QueryStream<Doc2, InnerKey, E2, R2, NoInfer<Direction>>,
    options: {
      readonly innerKey: NoInfer<InnerKey>;
      readonly onEmpty?: ((doc: Doc) => Doc3) | undefined;
    },
  ) => QueryStream<
    Doc2 | Doc3,
    readonly [...Key, ...InnerKey],
    E | E2,
    R | R2,
    Direction
  >
>(3, (self, f, options) => {
  // Runtime inner key fields follow the same convention as leaves: the
  // type-level key plus the implicit `_id` tiebreaker.
  const innerKeyFields = withIdTiebreaker(options.innerKey);
  return makeFlatMap(
    self,
    f,
    innerKeyFields,
    appendedTiebreaker(options.innerKey, innerKeyFields),
    options.onEmpty,
    {},
  );
});

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
      : Order.isGreaterThan(OrderKeyOrder)(existing.outer, incoming.outer)
        ? existing
        : Order.isLessThan(OrderKeyOrder)(existing.outer, incoming.outer)
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
      : Order.isLessThan(OrderKeyOrder)(existing.outer, incoming.outer)
        ? existing
        : Order.isGreaterThan(OrderKeyOrder)(existing.outer, incoming.outer)
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
  Direction extends OrderDirection,
  Doc3 = never,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
  f: (doc: Doc) => QueryStream<Doc2, InnerKey, E2, R2, Direction>,
  innerKeyFields: ReadonlyArray<string>,
  innerTiebreakers: ReadonlyArray<number>,
  /** What an outer document with no inner rows emits, if it is kept. */
  onEmpty: ((doc: Doc) => Doc3) | undefined,
  refinements: InnerRefinements,
): QueryStream<
  Doc2 | Doc3,
  readonly [...Key, ...InnerKey],
  E | E2,
  R | R2,
  Direction
> => {
  const outerLength = self.keyFields.length;
  const keyFields = Array.appendAll(self.keyFields, innerKeyFields);
  // The joined key keeps the outer key's tiebreaker *inside* it: the
  // type-level key `[...Key, ...InnerKey]` omits it, so it's recorded as a
  // tiebreaker position for `renameKey`/`distinct` to skip.
  const tiebreakers = Array.appendAll(
    self.tiebreakers,
    Array.map(innerTiebreakers, (position) => position + outerLength),
  );
  // The inner key of an outer document that contributes no inner elements
  // (filtered out, or an empty inner stream).
  const nullPadding: OrderKey = Array.makeBy(innerKeyFields.length, () => null);

  // Every inner stream `f` returns has the same type-level key and
  // direction, so the first one's runtime check (which catches the union
  // direction case and untyped callers) covers the rest.
  let validatedOnce = false;
  const validated = (
    inner: QueryStream<Doc2, InnerKey, E2, R2, Direction>,
  ): QueryStream<Doc2, InnerKey, E2, R2, Direction> => {
    if (validatedOnce) {
      return inner;
    }
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
    validatedOnce = true;
    return inner;
  };

  const innerBoundsFor = (outerKey: OrderKey): KeyBounds => ({
    lower:
      refinements.lower !== undefined &&
      OrderKeyOrder(outerKey, refinements.lower.outer) === 0
        ? Option.some(refinements.lower.inner)
        : Option.none(),
    upper:
      refinements.upper !== undefined &&
      OrderKeyOrder(outerKey, refinements.upper.outer) === 0
        ? Option.some(refinements.upper.inner)
        : Option.none(),
  });

  // The single element an outer document contributes when it has no inner
  // elements: filtered (cursor accounting only), or — for a left join — the
  // `onEmpty` placeholder. Either sits at the outer key followed by `null`s,
  // and is emitted only if that position is within the inner bounds.
  const markerStream = (
    outerKey: OrderKey,
    innerBounds: KeyBounds,
    doc: Option.Option<Doc2 | Doc3>,
  ): Stream.Stream<Element<Doc2 | Doc3>> =>
    admittedByLower(innerBounds.lower)(nullPadding) &&
    admittedByUpper(innerBounds.upper)(nullPadding)
      ? Stream.succeed([doc, Array.appendAll(outerKey, nullPadding)] as const)
      : Stream.empty;

  const annotated: Stream.Stream<
    Element<Doc2 | Doc3>,
    E | E2,
    R | R2
  > = self.annotated.pipe(
    Stream.flatMap(([outerDoc, outerKey]) => {
      const innerBounds = innerBoundsFor(outerKey);
      return Option.match(outerDoc, {
        onNone: () => markerStream(outerKey, innerBounds, Option.none()),
        onSome: (doc) => {
          const inner = validated(f(doc));
          return narrowByKeyBounds(inner, innerBounds).annotated.pipe(
            Stream.map(
              ([innerDoc, innerKey]) =>
                [innerDoc, Array.appendAll(outerKey, innerKey)] as const,
            ),
            Stream.orElseIfEmpty(() =>
              Stream.unwrap(
                Effect.gen(function* () {
                  const budget = yield* Effect.service(ReadBudget);
                  if (yield* isBudgetStopped(budget)) return Stream.empty;
                  const original = yield* Option.match(
                    Option.gen(function* () {
                      yield* Option.fromUndefinedOr(onEmpty);
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
                  const stopped = yield* isBudgetStopped(budget);
                  return Option.match(original, {
                    onSome: () => Stream.empty,
                    onNone: () =>
                      stopped
                        ? Stream.empty
                        : markerStream(
                            outerKey,
                            innerBounds,
                            Option.map(
                              Option.fromUndefinedOr(onEmpty),
                              (makeEmpty) => makeEmpty(doc),
                            ),
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
        innerTiebreakers,
        onEmpty,
        {
          lower: combineLowerRefinements(refinements.lower, lower.refinement),
          upper: combineUpperRefinements(refinements.upper, upper.refinement),
        },
      );
    },
    tiebreakers,
    // Refinements are key bounds, so they carry over; the inner streams
    // are reversed alongside the outer one to keep the direction rule.
    () =>
      makeFlatMap(
        reverse(self),
        (doc) => reverse(f(doc)),
        innerKeyFields,
        innerTiebreakers,
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
 * prefix, ...` — the first row of each group — executed as a loose index
 * scan (skip scan): after a group's first document, the underlying stream
 * is narrowed past the entire group, so each group costs one index seek
 * instead of a scan.
 *
 * `fields` must be a prefix of the stream's order key — enforced at the
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
  <const Fields extends ReadonlyArray<string>>(
    fields: Fields,
  ) => <
    Doc,
    Key extends readonly [...Fields, ...ReadonlyArray<string>],
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc, Key, E, R, Direction>,
  <
    const Fields extends ReadonlyArray<string>,
    Doc,
    Key extends readonly [...Fields, ...ReadonlyArray<string>],
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    fields: Fields,
  ) => QueryStream<Doc, Key, E, R, Direction>
>(2, (self, fields) => {
  const visible = visibleKeyFields(self);
  if (!keyFieldsEquivalence(fields, Array.take(visible, fields.length))) {
    throw new Error(
      `QueryStream.distinct: fields ([${Array.join(fields, ", ")}]) must be a prefix of the stream's order-key fields ([${Array.join(visible, ", ")}])`,
    );
  }
  // Groups are runs of equal *runtime* prefixes, so a prefix that reaches
  // past a tiebreaker (into a `flatMap` result's inner key) includes it.
  return makeDistinct(
    self,
    runtimePrefixLength(self, fields.length),
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
 * elements and their order are untouched — it exists so that `merge`
 * accepts streams whose keys agree positionally.
 *
 * Order keys are *values*, so relabeling changes only the names used for
 * compatibility validation — the element order is untouched, and narrowing
 * passes bounds through to the underlying stream unchanged. Use it to make
 * streams from different indexes or tables mergeable when their keys align
 * positionally; the caller asserts the *semantic* alignment of the
 * relabeled fields.
 *
 * (This is `convex-helpers`' `.orderBy()`. There it may also drop
 * equality-pinned prefix fields from the key — Confect's remaining-field
 * order keys already drop those at the leaf.)
 *
 * `key` must have as many fields as the stream's order key, enforced at
 * the type level via tuple length. The implicit `_id` tiebreakers the
 * type-level key omits — the trailing one, and a `flatMap` result's
 * interior one — keep their names and positions.
 *
 * @experimental
 */
export const renameKey = dual<
  <const NewKey extends ReadonlyArray<string>>(
    key: NewKey,
  ) => <
    Doc,
    Key extends ReadonlyArray<string> & {
      readonly length: NewKey["length"];
    },
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc, Types.Mutable<NewKey>, E, R, Direction>,
  <
    const NewKey extends ReadonlyArray<string>,
    Doc,
    Key extends ReadonlyArray<string> & {
      readonly length: NewKey["length"];
    },
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    key: NewKey,
  ) => QueryStream<Doc, Types.Mutable<NewKey>, E, R, Direction>
>(2, (self, key) => renameKeyImpl(self, key));

const renameKeyImpl = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  NewKey extends ReadonlyArray<string>,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
  key: NewKey,
): QueryStream<Doc, Types.Mutable<NewKey>, E, R, Direction> => {
  const visible = visibleKeyFields(self);
  if (key.length !== visible.length) {
    throw new Error(
      `QueryStream.renameKey: key ([${Array.join(key, ", ")}]) must have as many fields as the stream's order key ([${Array.join(visible, ", ")}])`,
    );
  }
  // Relabel the type-visible positions in order; tiebreakers keep their
  // names.
  const keyFields = Array.map(self.keyFields, (field, index) =>
    Array.contains(self.tiebreakers, index)
      ? field
      : Option.getOrThrowWith(
          Array.get(
            key,
            index -
              Array.filter(self.tiebreakers, (position) => position < index)
                .length,
          ),
          () =>
            new Error("QueryStream.renameKey: key/order-key length mismatch"),
        ),
  );
  return new QueryStream(
    self.order,
    keyFields,
    self.annotated,
    undefined,
    // Bounds are positional values, so they apply to the underlying
    // stream as-is.
    (bounds) => renameKeyImpl(narrowByKeyBounds(self, bounds), key),
    self.tiebreakers,
    () => renameKeyImpl(reverse(self), key),
  );
};

const makeDistinct = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R>,
  distinctLength: number,
  order: Direction,
  bounds: KeyBounds,
): QueryStream<Doc, Key, E, R, Direction> => {
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
    admittedByLower(bounds.lower)(key) && admittedByUpper(bounds.upper)(key);
  const annotated = Stream.unwrap(
    Effect.map(Effect.service(ReadBudget), (budget) =>
      Stream.paginate(
        narrowByKeyBounds(order === self.order ? self : reverse(self), {
          lower: groupBound(bounds.lower),
          upper: groupBound(bounds.upper),
        }),
        (
          current: QueryStream<Doc, Key, E, R>,
        ): Effect.Effect<
          readonly [ReadonlyArray<Element<Doc>>, Option.Option<typeof current>],
          E,
          R
        > =>
          Effect.gen(function* () {
            if (yield* isBudgetStopped(budget))
              return [[], Option.none()] as const;
            const discovered = yield* Stream.runHead(current.annotated);
            return yield* Option.match(discovered, {
              onNone: () => Effect.succeed([[], Option.none()] as const),
              onSome: (element) =>
                Effect.gen(function* () {
                  const [doc, key] = element;
                  const prefix = Array.take(key, distinctLength);
                  if (order === self.order) {
                    const nextKey = Option.match(doc, {
                      onNone: () => key,
                      onSome: () => prefix,
                    });
                    return [
                      isAdmitted(key) ? [element] : [],
                      Option.some(
                        narrowByKeyBounds(current, afterKey(nextKey)),
                      ),
                    ] as const;
                  }
                  const next = Option.some(
                    narrowByKeyBounds(current, afterKey(prefix)),
                  );
                  const firstKey = yield* Ref.make(Option.none<OrderKey>());
                  const selected = yield* narrowByKeyBounds(self, {
                    lower: Option.some({ key: prefix, inclusive: true }),
                    upper: Option.some({ key: prefix, inclusive: true }),
                  }).annotated.pipe(
                    Stream.tap(([, selectedKey]) =>
                      Ref.update(
                        firstKey,
                        Option.orElse(() => Option.some(selectedKey)),
                      ),
                    ),
                    Stream.filterMap(
                      Filter.fromPredicateOption((selectedElement) =>
                        Option.as(selectedElement[0], selectedElement),
                      ),
                    ),
                    Stream.runHead,
                  );
                  return yield* Option.match(selected, {
                    onNone: () =>
                      Effect.gen(function* () {
                        if (yield* isBudgetStopped(budget))
                          return [[], Option.none()] as const;
                        const checkpoint = Option.getOrElse(
                          yield* Ref.get(firstKey),
                          () => key,
                        );
                        return [
                          isAdmitted(checkpoint)
                            ? [[Option.none<Doc>(), checkpoint] as const]
                            : [],
                          next,
                        ] as const;
                      }),
                    onSome: (representative) =>
                      Effect.succeed([
                        isAdmitted(representative[1]) ? [representative] : [],
                        next,
                      ] as const),
                  });
                }),
            });
          }),
      ),
    ),
  );

  return new QueryStream(
    order,
    self.keyFields,
    annotated,
    undefined,
    (keyBounds) =>
      makeDistinct(self, distinctLength, order, {
        lower: combineKeyBound(bounds.lower, keyBounds.lower, tightestLower),
        upper: combineKeyBound(bounds.upper, keyBounds.upper, tightestUpper),
      }),
    self.tiebreakers,
    () => makeDistinct(self, distinctLength, flipDirection(order), bounds),
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
  Key extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
): QueryStream<Doc, Key, E, R, Flip<Direction>> => {
  if (self.reverseWith === undefined) {
    throw new Error(
      "QueryStream.reverse: this stream cannot be reversed without a reversal recipe",
    );
  }
  return self.reverseWith();
};

/**
 * At least one endpoint in stream order. Omit the other to leave that side
 * unbounded.
 *
 * @experimental
 */
export type NarrowBounds =
  | {
      readonly start: KeyBound;
      readonly end?: KeyBound | undefined;
    }
  | {
      readonly start?: KeyBound | undefined;
      readonly end: KeyBound;
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
 * In SQL terms: keyset predicates on the `ORDER BY` columns — `WHERE (k1,
 * k2) >= (:start) AND (k1, k2) < (:end)` for an ascending, start-inclusive,
 * end-exclusive range — added to every query in the
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
  ) => <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
  ) => QueryStream<Doc, Key, E, R, Direction>,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    bounds: NarrowBounds,
  ) => QueryStream<Doc, Key, E, R, Direction>
>(
  2,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
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
  Key extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
  bounds: KeyBounds,
): QueryStream<Doc, Key, E, R, Direction> =>
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
      onSome: (bound) => KeyCutOrder(exactCut(key), lowerCut(bound)) > 0,
    });

/** Whether a key sits before the upper bound (always, when unbounded). */
const admittedByUpper =
  (upper: Option.Option<KeyBound>) =>
  (key: OrderKey): boolean =>
    Option.match(upper, {
      onNone: () => true,
      onSome: (bound) => KeyCutOrder(exactCut(key), upperCut(bound)) < 0,
    });

/** The fallback for streams that don't know how to rebuild themselves. */
const narrowInMemory = <
  Doc,
  Key extends ReadonlyArray<string>,
  E,
  R,
  Direction extends OrderDirection,
>(
  self: QueryStream<Doc, Key, E, R, Direction>,
  bounds: KeyBounds,
): QueryStream<Doc, Key, E, R, Direction> => {
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
    undefined,
    undefined,
    self.tiebreakers,
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
 * `.unique()`) — `LIMIT 2` followed by a check.
 *
 * @experimental
 */
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
 *
 * @experimental
 */
export const serializeCursor = (key: OrderKey): string =>
  JSON.stringify(
    Array.map(key, (value) =>
      value === undefined ? UNDEFINED_SENTINEL : convexToJson(value),
    ),
  );

/**
 * @experimental
 */
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

/**
 * The cursor denoting the end of the stream.
 *
 * @experimental
 */
export const END_CURSOR = "[]";

/**
 * Reading this many rows into one page earns a `SplitRecommended` — half of
 * `convex-helpers`' `MAX_DOCUMENT_SCAN_LEN` (32000), as there.
 */
const SOFT_MAX_SCAN_LENGTH = 16000;

/**
 * The pagination protocol's request options — `PaginationOptions` from
 * `convex/server`, aliased so the wire protocol has a single source of
 * truth (`@confect/core`'s `PaginationOptions` schema encodes the same
 * shape).
 *
 * @experimental
 */
export type PaginateOptions = ConvexPaginationOptions;

/**
 * The pagination protocol's result — `PaginationResult` from
 * `convex/server` (whose `page` is a mutable array type, which is why
 * handlers can return this value where Convex expects its result shape).
 *
 * @experimental
 */
export type PaginationResult<Doc> = ConvexPaginationResult<Doc>;

/**
 * A page exhausted its read budget without a safe logical continuation.
 *
 * @experimental
 */
export class ReadBudgetExceededError extends Schema.TaggedError<ReadBudgetExceededError>()(
  "ReadBudgetExceededError",
  { rowsRead: Schema.Finite, bytesRead: Schema.optionalKey(Schema.Finite) },
) {
  override get message() {
    return "QueryStream.paginate: the read budget was exhausted before a safe page boundary; increase the budget or simplify the query";
  }
}

type BudgetStatus = Data.TaggedEnum<{
  Active: {};
  Stopped: {};
}>;

const BudgetStatus = Data.taggedEnum<BudgetStatus>();

interface ReadBudgetState {
  readonly rows: number;
  readonly bytes: number;
  readonly status: BudgetStatus;
}

interface ReadBudget {
  readonly state: SynchronizedRef.SynchronizedRef<ReadBudgetState>;
  readonly maximumRowsRead: Option.Option<number>;
  readonly maximumBytesRead: Option.Option<number>;
}

const isBudgetExhausted = (
  budget: ReadBudget,
  state: ReadBudgetState,
): boolean =>
  Option.exists(budget.maximumRowsRead, (limit) => state.rows >= limit) ||
  Option.exists(budget.maximumBytesRead, (limit) => state.bytes >= limit);

const isBudgetStopped = (
  maybeBudget: Option.Option<ReadBudget>,
): Effect.Effect<boolean> =>
  Option.match(maybeBudget, {
    onNone: () => Effect.succeed(false),
    onSome: (budget) =>
      Effect.map(SynchronizedRef.get(budget.state), (state) =>
        BudgetStatus.$is("Stopped")(state.status),
      ),
  });

const ReadBudget = Context.Reference<Option.Option<ReadBudget>>(
  "@confect/server/QueryStream/ReadBudget",
  { defaultValue: Option.none },
);

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
 * Consume one page of a stream.
 *
 * In SQL terms: keyset pagination — `WHERE (key) > :cursor ORDER BY key
 * LIMIT :numItems`; with `endCursor`, `AND (key) <= :endCursor` and no
 * `LIMIT`. It runs the stream narrowed to the keys after `cursor` (and up
 * to `endCursor`, when given), folds `numItems` present documents into a
 * page, and reports the key it stopped at as the next cursor; a cursor is a
 * key, not an offset, so a page costs one page of reads wherever it starts.
 *
 * Semantics follow `convex-helpers/server/stream`:
 *
 * - `cursor` is exclusive, `endCursor` inclusive; when `endCursor` is set,
 *   `numItems` is ignored and the page runs to the end cursor — the
 *   reactive-adjacency guarantee that keeps concurrent pages gap-free.
 * - Row and byte budgets count all QueryStream leaf reads, including
 *   filtered documents, discovery seeks, and prefetched merge inputs.
 *   Bytes use estimated document sizes, not backend-billed bytes; a
 *   document's size is known only after it is read.
 * - Budget stops return `SplitRequired` at a safe output boundary. If no
 *   safe progress is possible, the effect fails with `ReadBudgetExceededError`.
 *   A resource stop never proves an input or a distinct group empty.
 *
 * @experimental
 */
export const paginate: {
  (
    options: PaginateOptions,
  ): <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
  ) => Effect.Effect<PaginationResult<Doc>, E | ReadBudgetExceededError, R>;
  <Doc, Key extends ReadonlyArray<string>, E, R>(
    self: QueryStream<Doc, Key, E, R>,
    options: PaginateOptions,
  ): Effect.Effect<PaginationResult<Doc>, E | ReadBudgetExceededError, R>;
} = dual(
  2,
  <
    Doc,
    Key extends ReadonlyArray<string>,
    E,
    R,
    Direction extends OrderDirection,
  >(
    self: QueryStream<Doc, Key, E, R, Direction>,
    options: PaginateOptions,
  ) =>
    Effect.gen(function* () {
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
      const start = Option.getOrUndefined(
        Option.map(after, (key) => ({ key, inclusive: false })),
      );
      const end = Option.getOrUndefined(
        Option.map(until, (key) => ({ key, inclusive: true })),
      );
      const narrowed =
        start !== undefined
          ? narrow(self, { start, end })
          : end !== undefined
            ? narrow(self, { end })
            : self;
      // With an endCursor the page runs to it, however many items that is.
      const maxRows = Option.match(endCursor, {
        onNone: () => Option.some(options.numItems),
        onSome: () => Option.none<number>(),
      });
      const maximumRowsRead = Option.fromUndefinedOr(options.maximumRowsRead);
      const maximumBytesRead = Option.fromUndefinedOr(options.maximumBytesRead);
      const budget: ReadBudget = {
        state: yield* SynchronizedRef.make<ReadBudgetState>({
          rows: 0,
          bytes: 0,
          status: BudgetStatus.Active(),
        }),
        maximumRowsRead,
        maximumBytesRead,
      };
      const activeBudget = Option.as(
        Option.orElse(maximumRowsRead, () => maximumBytesRead),
        budget,
      );
      return yield* pipe(
        Stream.run(
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
              return Effect.map(
                SynchronizedRef.get(budget.state),
                (usage): PaginateState<Doc> => {
                  const hitLimit = isBudgetExhausted(budget, usage);
                  return {
                    page,
                    readKeys,
                    hitLimit,
                    stopped:
                      hitLimit ||
                      Option.exists(
                        maxRows,
                        (limit) => Chunk.size(page) >= limit,
                      ),
                  };
                },
              );
            },
          ),
        ),
        Effect.provideService(ReadBudget, activeBudget),
        Effect.flatMap((state) =>
          Effect.gen(function* () {
            const usage = yield* SynchronizedRef.get(budget.state);
            const stopped = BudgetStatus.$is("Stopped")(usage.status);
            const limited = stopped || state.hitLimit;
            if (
              limited &&
              (Chunk.isEmpty(state.readKeys) ||
                Option.exists(
                  pinnedEnd,
                  (endpoint) => midpointCursor(state.readKeys) === endpoint,
                ))
            ) {
              return yield* new ReadBudgetExceededError({
                rowsRead: usage.rows,
                ...Option.match(maximumBytesRead, {
                  onNone: () => ({}),
                  onSome: () => ({
                    bytesRead: usage.bytes,
                  }),
                }),
              });
            }
            return stopped
              ? { ...state, stopped: true, hitLimit: true }
              : state;
          }),
        ),
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
                : // A growing page that had to scan far past its item budget
                  // (a filter-heavy stream) recommends a split so reactive
                  // clients can subdivide it instead of re-scanning forever.
                  Chunk.size(state.readKeys) >= SOFT_MAX_SCAN_LENGTH
                  ? {
                      page,
                      isDone: false,
                      continueCursor: serializeCursor(lastKey),
                      pageStatus: "SplitRecommended" as const,
                      splitCursor: midpointCursor(state.readKeys),
                    }
                  : {
                      page,
                      isDone: false,
                      continueCursor: serializeCursor(lastKey),
                    },
            // The narrowed stream was exhausted: either we reached the
            // pinned end cursor (more may follow it) or the true end of
            // the stream. An endCursor-pinned page that has grown well
            // past its requested size recommends a split, so reactive
            // clients can subdivide it (as `convex-helpers` does).
            onNone: () => {
              // Any pinned page — including one pinned to the end of the
              // stream — that has grown well past its requested size
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
                      () => END_CURSOR,
                    ),
                    pageStatus: "SplitRecommended" as const,
                    splitCursor: midpointCursor(state.readKeys),
                  }
                : {
                    page,
                    isDone: Option.isNone(pinnedEnd),
                    continueCursor: Option.getOrElse(
                      pinnedEnd,
                      () => END_CURSOR,
                    ),
                  };
            },
          });
        }),
      );
    }),
);
