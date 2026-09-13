import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Result from "effect/Result";
import * as QueryStreamKey from "./QueryStreamKey";
import type * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";

// A bound's key may be a *prefix* of the full key: bounding by `["a"]` means
// bounding by the whole family of keys that start with `"a"`. To compare
// bounds and keys uniformly, each is modelled as a "cut"—a position
// *between* keys: the `predecessor` cut of a prefix sits just before every
// key extending it, the `successor` cut just after, and an `exact` cut is a
// full key itself. (This is `convex-helpers`' `compareKeys` model.)

/**
 * One side of a range: a (possibly prefix) key and whether it's included.
 *
 * @experimental
 */
export interface KeyBound {
  readonly orderKey: QueryStreamOrderKey.QueryStreamOrderKey;
  readonly inclusive: boolean;
}

/**
 * Bounds over a stream's order key, in _ascending key space_ (`narrow` converts
 * from stream space, where `desc` reverses which end is which).
 *
 * @experimental
 */
export interface KeyBounds {
  readonly lower: Option.Option<KeyBound>;
  readonly upper: Option.Option<KeyBound>;
}

/**
 * Bounds in _full index-key space_: `eq`-pinned values appear as a shared
 * prefix of both keys (`fromBounds` re-derives them as `eq` constraints). An
 * empty key bounds nothing.
 *
 * @experimental
 */
export interface IndexBounds {
  readonly lower: KeyBound;
  readonly upper: KeyBound;
}

type KeyCut = Data.TaggedEnum<{
  Predecessor: { readonly orderKey: QueryStreamOrderKey.QueryStreamOrderKey };
  Exact: { readonly orderKey: QueryStreamKey.Complete };
  Successor: { readonly orderKey: QueryStreamOrderKey.QueryStreamOrderKey };
}>;
const KeyCut = Data.taggedEnum<KeyCut>();

const cutRank = KeyCut.$match({
  Predecessor: () => 0,
  Exact: () => 1,
  Successor: () => 2,
});

const cutValues = KeyCut.$match({
  Predecessor: ({ orderKey }) => orderKey,
  Exact: ({ orderKey }) => QueryStreamKey.values(orderKey),
  Successor: ({ orderKey }) => orderKey,
});

const KeyCutOrder: Order.Order<KeyCut> = Order.make((self, that) => {
  const selfValues = cutValues(self);
  const thatValues = cutValues(that);
  const minLength = Math.min(selfValues.length, thatValues.length);
  const prefixOrdering = QueryStreamOrderKey.Order(
    Array.take(selfValues, minLength),
    Array.take(thatValues, minLength),
  );
  if (prefixOrdering !== 0) {
    return prefixOrdering;
  }
  if (selfValues.length === thatValues.length) {
    return Order.Number(cutRank(self), cutRank(that));
  }
  // One key is a proper prefix of the other. The shorter cut sits just
  // before (`predecessor`) or just after (`successor`) *every* key
  // extending its prefix—the longer one included. (`exact` cuts are
  // always full keys, so an `exact` cut is never the shorter one here.)
  const selfIsShorter = selfValues.length < thatValues.length;
  const shorter = selfIsShorter ? self : that;
  const shorterOrdering = KeyCut.$match(shorter, {
    Predecessor: () => -1 as const,
    Exact: () => 1 as const,
    Successor: () => 1 as const,
  });
  return selfIsShorter ? shorterOrdering : (-shorterOrdering as -1 | 1);
});

const lowerCut = (bound: KeyBound): KeyCut =>
  bound.inclusive
    ? KeyCut.Predecessor({ orderKey: bound.orderKey })
    : KeyCut.Successor({ orderKey: bound.orderKey });

const upperCut = (bound: KeyBound): KeyCut =>
  bound.inclusive
    ? KeyCut.Successor({ orderKey: bound.orderKey })
    : KeyCut.Predecessor({ orderKey: bound.orderKey });

/**
 * The stricter (later) of two lower bounds.
 *
 * @experimental
 */
export const tightestLower = (self: KeyBound, that: KeyBound): KeyBound =>
  Order.isGreaterThan(KeyCutOrder)(lowerCut(that), lowerCut(self))
    ? that
    : self;

/**
 * The stricter (earlier) of two upper bounds.
 *
 * @experimental
 */
export const tightestUpper = (self: KeyBound, that: KeyBound): KeyBound =>
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

/**
 * @experimental
 */
export const intersect = (self: KeyBounds, that: KeyBounds): KeyBounds => ({
  lower: combineKeyBound(self.lower, that.lower, tightestLower),
  upper: combineKeyBound(self.upper, that.upper, tightestUpper),
});

/**
 * @experimental
 */
export const isEmpty = (bounds: IndexBounds): boolean =>
  KeyCutOrder(lowerCut(bounds.lower), upperCut(bounds.upper)) >= 0;

/**
 * @experimental
 */
export const intersectIndexBounds = (
  self: IndexBounds,
  that: IndexBounds,
): IndexBounds => ({
  lower: tightestLower(self.lower, that.lower),
  upper: tightestUpper(self.upper, that.upper),
});

/**
 * Whether a key sits after the lower bound (always, when unbounded).
 *
 * @experimental
 */
export const admittedByLower =
  (lower: Option.Option<ParsedBound>) =>
  (orderKey: QueryStreamKey.Complete): boolean =>
    Option.match(lower, {
      onNone: () => true,
      onSome: (bound) =>
        KeyCutOrder(KeyCut.Exact({ orderKey }), lowerCut(rawBound(bound))) > 0,
    });

/**
 * Whether a key sits before the upper bound (always, when unbounded).
 *
 * @experimental
 */
export const admittedByUpper =
  (upper: Option.Option<ParsedBound>) =>
  (orderKey: QueryStreamKey.Complete): boolean =>
    Option.match(upper, {
      onNone: () => true,
      onSome: (bound) =>
        KeyCutOrder(KeyCut.Exact({ orderKey }), upperCut(rawBound(bound))) < 0,
    });

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

interface ParsedBound {
  readonly orderKey: QueryStreamKey.Prefix;
  readonly inclusive: boolean;
}

export interface ParsedBounds {
  readonly lower: Option.Option<ParsedBound>;
  readonly upper: Option.Option<ParsedBound>;
}

const rawBound = (bound: ParsedBound): KeyBound => ({
  orderKey: QueryStreamKey.prefixValues(bound.orderKey),
  inclusive: bound.inclusive,
});

export const parse = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  bounds: KeyBounds,
): Result.Result<ParsedBounds, QueryStreamKey.KeyWidthMismatchError> => {
  const endpoint = (bound: Option.Option<KeyBound>) =>
    Option.match(bound, {
      onNone: () => Result.succeed(Option.none<ParsedBound>()),
      onSome: ({ orderKey, inclusive }) =>
        Result.map(QueryStreamKey.prefix(layout, orderKey), (prefix) =>
          Option.some({ orderKey: prefix, inclusive }),
        ),
    });
  return Result.gen(function* () {
    const lower = yield* endpoint(bounds.lower);
    const upper = yield* endpoint(bounds.upper);
    return { lower, upper };
  });
};

export const toBounds = (bounds: ParsedBounds): KeyBounds => ({
  lower: Option.map(bounds.lower, rawBound),
  upper: Option.map(bounds.upper, rawBound),
});
