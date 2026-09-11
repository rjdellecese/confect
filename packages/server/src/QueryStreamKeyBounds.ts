import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import type * as Record from "effect/Record";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";
import type { QueryStreamOrderKey as OrderKey } from "./QueryStreamOrderKey";

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

export type CutKind = "predecessor" | "exact" | "successor";

export interface KeyCut {
  readonly key: OrderKey;
  readonly kind: CutKind;
}

const cutKindRank: Record.ReadonlyRecord<CutKind, number> = {
  predecessor: 0,
  exact: 1,
  successor: 2,
};

export const KeyCutOrder: Order.Order<KeyCut> = Order.make((self, that) => {
  const minLength = Math.min(self.key.length, that.key.length);
  const prefixOrdering = QueryStreamOrderKey.Order(
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
  // extending its prefix—the longer one included. (`exact` cuts are
  // always full keys, so an `exact` cut is never the shorter one here.)
  const selfIsShorter = self.key.length < that.key.length;
  const shorter = selfIsShorter ? self : that;
  const shorterOrdering = shorter.kind === "predecessor" ? -1 : 1;
  return selfIsShorter ? shorterOrdering : (-shorterOrdering as -1 | 1);
});

export const exactCut = (key: OrderKey): KeyCut => ({ key, kind: "exact" });

export const lowerCut = (bound: KeyBound): KeyCut => ({
  key: bound.key,
  kind: bound.inclusive ? "predecessor" : "successor",
});

export const upperCut = (bound: KeyBound): KeyCut => ({
  key: bound.key,
  kind: bound.inclusive ? "successor" : "predecessor",
});

/** The stricter (later) of two lower bounds. */
export const tightestLower = (self: KeyBound, that: KeyBound): KeyBound =>
  Order.isGreaterThan(KeyCutOrder)(lowerCut(that), lowerCut(self))
    ? that
    : self;

/** The stricter (earlier) of two upper bounds. */
export const tightestUpper = (self: KeyBound, that: KeyBound): KeyBound =>
  Order.isLessThan(KeyCutOrder)(upperCut(that), upperCut(self)) ? that : self;

export const combineKeyBound = (
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

export const intersectIndexBounds = (
  self: IndexBounds,
  that: IndexBounds,
): IndexBounds => ({
  lower: tightestLower(self.lower, that.lower),
  upper: tightestUpper(self.upper, that.upper),
});

/** Whether a key sits after the lower bound (always, when unbounded). */
export const admittedByLower =
  (lower: Option.Option<KeyBound>) =>
  (key: OrderKey): boolean =>
    Option.match(lower, {
      onNone: () => true,
      onSome: (bound) => KeyCutOrder(exactCut(key), lowerCut(bound)) > 0,
    });

/** Whether a key sits before the upper bound (always, when unbounded). */
export const admittedByUpper =
  (upper: Option.Option<KeyBound>) =>
  (key: OrderKey): boolean =>
    Option.match(upper, {
      onNone: () => true,
      onSome: (bound) => KeyCutOrder(exactCut(key), upperCut(bound)) < 0,
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
