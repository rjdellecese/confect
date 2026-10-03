import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Result from "effect/Result";
import * as QueryStreamKey from "./QueryStreamKey";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import * as QueryStreamKeyValues from "./QueryStreamKeyValues";

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
  readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
  readonly inclusive: boolean;
}

/**
 * Bounds over a stream's key, in _ascending key space_ (`narrow` converts from
 * stream space, where `desc` reverses which end is which).
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
  Predecessor: {
    readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
  };
  Exact: { readonly key: QueryStreamKey.Complete };
  Successor: { readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues };
}>;
const KeyCut = Data.taggedEnum<KeyCut>();

const cutRank = KeyCut.$match({
  Predecessor: () => 0,
  Exact: () => 1,
  Successor: () => 2,
});

const cutKeyValues = KeyCut.$match({
  Predecessor: ({ keyValues }) => keyValues,
  Exact: ({ key }) => QueryStreamKey.values(key),
  Successor: ({ keyValues }) => keyValues,
});

const KeyCutOrder: Order.Order<KeyCut> = Order.make((self, that) => {
  const selfKeyValues = cutKeyValues(self);
  const thatKeyValues = cutKeyValues(that);
  const minLength = Math.min(selfKeyValues.length, thatKeyValues.length);
  const prefixOrdering = QueryStreamKeyValues.Order("asc")(
    Array.take(selfKeyValues, minLength),
    Array.take(thatKeyValues, minLength),
  );
  if (prefixOrdering !== 0) {
    return prefixOrdering;
  }
  if (selfKeyValues.length === thatKeyValues.length) {
    return Order.Number(cutRank(self), cutRank(that));
  }
  // One key is a proper prefix of the other. The shorter cut sits just
  // before (`predecessor`) or just after (`successor`) *every* key
  // extending its prefix—the longer one included. (`exact` cuts are
  // always full keys, so an `exact` cut is never the shorter one here.)
  const selfIsShorter = selfKeyValues.length < thatKeyValues.length;
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
    ? KeyCut.Predecessor({ keyValues: bound.keyValues })
    : KeyCut.Successor({ keyValues: bound.keyValues });

const upperCut = (bound: KeyBound): KeyCut =>
  bound.inclusive
    ? KeyCut.Successor({ keyValues: bound.keyValues })
    : KeyCut.Predecessor({ keyValues: bound.keyValues });

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
  self: Option.Option<ParsedBound>,
  that: Option.Option<ParsedBound>,
  combine: (self: ParsedBound, that: ParsedBound) => ParsedBound,
): Option.Option<ParsedBound> =>
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
export const intersect = (
  self: ParsedBounds,
  that: ParsedBounds,
): Result.Result<ParsedBounds, QueryStreamKeyLayout.KeyLayoutMismatchError> =>
  Result.map(forLayout(self.keyLayout, that), () =>
    make(self.keyLayout, {
      lower: combineKeyBound(self.lower, that.lower, tighterLower),
      upper: combineKeyBound(self.upper, that.upper, tighterUpper),
    }),
  );

/**
 * @experimental
 */
export const isEmpty = (indexBounds: IndexBounds): boolean =>
  KeyCutOrder(lowerCut(indexBounds.lower), upperCut(indexBounds.upper)) >= 0;

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
 * Whether a compatible key sits after the lower bound (always, when unbounded).
 *
 * @experimental
 */
export const admittedByLower =
  (parsedBounds: ParsedBounds) =>
  (
    key: QueryStreamKey.Complete,
  ): Result.Result<boolean, QueryStreamKeyLayout.KeyLayoutMismatchError> =>
    Result.gen(function* () {
      yield* QueryStreamKeyLayout.validateEquivalence(
        parsedBounds.keyLayout,
        key.layout,
      );
      return Option.match(parsedBounds.lower, {
        onNone: () => true,
        onSome: (bound) =>
          KeyCutOrder(KeyCut.Exact({ key }), lowerCut(rawBound(bound))) > 0,
      });
    });

/**
 * Whether a compatible key sits before the upper bound (always, when
 * unbounded).
 *
 * @experimental
 */
export const admittedByUpper =
  (parsedBounds: ParsedBounds) =>
  (
    key: QueryStreamKey.Complete,
  ): Result.Result<boolean, QueryStreamKeyLayout.KeyLayoutMismatchError> =>
    Result.gen(function* () {
      yield* QueryStreamKeyLayout.validateEquivalence(
        parsedBounds.keyLayout,
        key.layout,
      );
      return Option.match(parsedBounds.upper, {
        onNone: () => true,
        onSome: (bound) =>
          KeyCutOrder(KeyCut.Exact({ key }), upperCut(rawBound(bound))) < 0,
      });
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

export interface ParsedBound {
  readonly key: QueryStreamKey.Prefix;
  readonly inclusive: boolean;
}

// Endpoints validated against a stream layout. Operations that preserve the
// key space retain these values; coordinate changes construct new endpoints.
const TypeId = "~@confect/server/QueryStreamKeyBounds";

export interface ParsedBounds {
  readonly [TypeId]: typeof TypeId;
  readonly keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly lower: Option.Option<ParsedBound>;
  readonly upper: Option.Option<ParsedBound>;
}

const make = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  endpoints: Pick<ParsedBounds, "lower" | "upper">,
): ParsedBounds => ({
  [TypeId]: TypeId,
  keyLayout,
  lower: endpoints.lower,
  upper: endpoints.upper,
});

export const unbounded = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
): ParsedBounds =>
  make(keyLayout, { lower: Option.none(), upper: Option.none() });

export const forLayout = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  parsedBounds: ParsedBounds,
): Result.Result<ParsedBounds, QueryStreamKeyLayout.KeyLayoutMismatchError> =>
  Result.gen(function* () {
    yield* QueryStreamKeyLayout.validateEquivalence(
      keyLayout,
      parsedBounds.keyLayout,
    );
    return parsedBounds;
  });

// Combining existing parsed endpoints still needs a shared layout, including
// when one or both endpoints are absent.
export const fromParsed = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  endpoints: Pick<ParsedBounds, "lower" | "upper">,
): Result.Result<ParsedBounds, QueryStreamKeyLayout.KeyLayoutMismatchError> => {
  const validateEndpoint = (endpoint: Option.Option<ParsedBound>) =>
    Option.match(endpoint, {
      onNone: () => Result.succeed(undefined),
      onSome: ({ key }) =>
        QueryStreamKeyLayout.validateEquivalence(keyLayout, key.layout),
    });
  return Result.gen(function* () {
    yield* validateEndpoint(endpoints.lower);
    yield* validateEndpoint(endpoints.upper);
    return make(keyLayout, endpoints);
  });
};

const rawBound = (bound: ParsedBound): KeyBound => ({
  keyValues: QueryStreamKey.values(bound.key),
  inclusive: bound.inclusive,
});

// Select existing endpoints so intersection retains their parsed keys.
const tighterLower = (self: ParsedBound, that: ParsedBound): ParsedBound =>
  KeyCutOrder(lowerCut(rawBound(that)), lowerCut(rawBound(self))) > 0
    ? that
    : self;

const tighterUpper = (self: ParsedBound, that: ParsedBound): ParsedBound =>
  KeyCutOrder(upperCut(rawBound(that)), upperCut(rawBound(self))) < 0
    ? that
    : self;

export const tightestParsedLower = (
  self: ParsedBound,
  that: ParsedBound,
): Result.Result<ParsedBound, QueryStreamKeyLayout.KeyLayoutMismatchError> =>
  Result.gen(function* () {
    yield* QueryStreamKeyLayout.validateEquivalence(
      self.key.layout,
      that.key.layout,
    );
    return tighterLower(self, that);
  });

export const tightestParsedUpper = (
  self: ParsedBound,
  that: ParsedBound,
): Result.Result<ParsedBound, QueryStreamKeyLayout.KeyLayoutMismatchError> =>
  Result.gen(function* () {
    yield* QueryStreamKeyLayout.validateEquivalence(
      self.key.layout,
      that.key.layout,
    );
    return tighterUpper(self, that);
  });

export const parseBound = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  { keyValues, inclusive }: KeyBound,
): Result.Result<ParsedBound, QueryStreamKey.KeyWidthMismatchError> =>
  Result.map(QueryStreamKey.prefix(keyLayout, keyValues), (key) => ({
    key,
    inclusive,
  }));

export const parse = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  keyBounds: KeyBounds,
): Result.Result<ParsedBounds, QueryStreamKey.KeyWidthMismatchError> => {
  const endpoint = (bound: Option.Option<KeyBound>) =>
    Option.match(bound, {
      onNone: () => Result.succeed(Option.none<ParsedBound>()),
      onSome: (value) => Result.map(parseBound(keyLayout, value), Option.some),
    });
  return Result.gen(function* () {
    const lower = yield* endpoint(keyBounds.lower);
    const upper = yield* endpoint(keyBounds.upper);
    return make(keyLayout, { lower, upper });
  });
};

export const toBounds = (parsedBounds: ParsedBounds): KeyBounds => ({
  lower: Option.map(parsedBounds.lower, rawBound),
  upper: Option.map(parsedBounds.upper, rawBound),
});
