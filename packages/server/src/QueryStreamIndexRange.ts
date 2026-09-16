import type {
  GenericDocument,
  FieldTypeFromFieldPath,
  IndexRange as ConvexIndexRange,
  IndexRangeBuilder as ConvexIndexRangeBuilder,
} from "convex/server";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import { identity, pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type * as Types from "effect/Types";
import * as QueryStreamIndexPrefix from "./QueryStreamIndexPrefix";
import * as QueryStreamKeyBounds from "./QueryStreamKeyBounds";
import type { IndexBounds } from "./QueryStreamKeyBounds";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";
import type { QueryStreamOrderDirection as OrderDirection } from "./QueryStreamOrderDirection";

type Head<FieldPaths extends ReadonlyArray<string>> =
  FieldPaths extends readonly [infer H extends string, ...ReadonlyArray<string>]
    ? H
    : never;

type Tail<FieldPaths extends ReadonlyArray<string>> =
  FieldPaths extends readonly [
    string,
    ...infer Rest extends ReadonlyArray<string>,
  ]
    ? Rest
    : ReadonlyArray<string>;

// The range builder mirrors Convex's `IndexRangeBuilder`, but *consumes* the
// index-field tuple at the type level as `eq` pins field paths. The remaining
// tuple supplies the initial visible ordering labels of the resulting stream.

const TypeId = "~@confect/server/QueryStreamIndexRange";

interface Equality {
  readonly fieldPath: string;
  readonly value: QueryStreamOrderKey.KeyValue;
}

interface Endpoint {
  readonly value: QueryStreamOrderKey.KeyValue;
  readonly inclusive: boolean;
}

type Interval = Data.TaggedEnum<{
  Lower: { readonly lower: Endpoint };
  Upper: { readonly upper: Endpoint };
  Between: { readonly lower: Endpoint; readonly upper: Endpoint };
}>;

const Interval = Data.taggedEnum<Interval>();

interface Constraints {
  readonly equalities: ReadonlyArray<Equality>;
  readonly bounded: Option.Option<{
    readonly fieldPath: string;
    readonly interval: Interval;
  }>;
}

/**
 * The equality prefix followed by at most one bounded field.
 */
export interface QueryStreamIndexRange<
  out RemainingFieldPaths extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  readonly [TypeId]: Constraints & {
    readonly _Remaining: Types.Covariant<RemainingFieldPaths>;
  };
}

/**
 * @experimental
 */
export type Remaining<Range> =
  Range extends QueryStreamIndexRange<infer R> ? R : never;

/**
 * A typed index-range builder. `eq` must target the next unpinned index field,
 * and consumes it; `gt`/`gte`/`lt`/`lte` bound the next field without consuming
 * it (bounded field paths still vary within the range).
 *
 * @experimental
 */
export interface Builder<
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
> extends QueryStreamIndexRange<FieldPaths> {
  readonly eq: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => Builder<ConvexDoc, Tail<FieldPaths>>;
  readonly gt: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => LowerBoundedBuilder<ConvexDoc, FieldPaths>;
  readonly gte: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => LowerBoundedBuilder<ConvexDoc, FieldPaths>;
  readonly lt: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => QueryStreamIndexRange<FieldPaths>;
  readonly lte: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => QueryStreamIndexRange<FieldPaths>;
}

/**
 * After `gt`/`gte`, only an upper bound on the same field may follow.
 *
 * @experimental
 */
export interface LowerBoundedBuilder<
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
> extends QueryStreamIndexRange<FieldPaths> {
  readonly lt: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => QueryStreamIndexRange<FieldPaths>;
  readonly lte: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => QueryStreamIndexRange<FieldPaths>;
}

const make = <
  RemainingFieldPaths extends ReadonlyArray<string> = ReadonlyArray<string>,
>(
  constraints: Constraints,
): QueryStreamIndexRange<RemainingFieldPaths> => ({
  [TypeId]: {
    ...constraints,
    _Remaining: identity,
  },
});

const makeBuilder = <
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
>(
  equalities: ReadonlyArray<Equality>,
): Builder<ConvexDoc, FieldPaths> => {
  const upper =
    (inclusive: boolean) =>
    (fieldPath: string, value: QueryStreamOrderKey.KeyValue) =>
      make<FieldPaths>({
        equalities,
        bounded: Option.some({
          fieldPath,
          interval: Interval.Upper({ upper: { value, inclusive } }),
        }),
      });

  const lower =
    (inclusive: boolean) =>
    (
      fieldPath: string,
      value: QueryStreamOrderKey.KeyValue,
    ): LowerBoundedBuilder<ConvexDoc, FieldPaths> => {
      const endpoint = { value, inclusive };

      const finish =
        (upperInclusive: boolean) =>
        (_fieldPath: string, upperValue: QueryStreamOrderKey.KeyValue) =>
          make<FieldPaths>({
            equalities,
            bounded: Option.some({
              fieldPath,
              interval: Interval.Between({
                lower: endpoint,
                upper: { value: upperValue, inclusive: upperInclusive },
              }),
            }),
          });

      return {
        ...make<FieldPaths>({
          equalities,
          bounded: Option.some({
            fieldPath,
            interval: Interval.Lower({ lower: endpoint }),
          }),
        }),
        lt: finish(false),
        lte: finish(true),
      };
    };

  return {
    ...make<FieldPaths>({ equalities, bounded: Option.none() }),
    eq: (fieldPath, value) =>
      makeBuilder<ConvexDoc, Tail<FieldPaths>>(
        Array.append(equalities, { fieldPath, value }),
      ),
    gt: lower(false),
    gte: lower(true),
    lt: upper(false),
    lte: upper(true),
  };
};

/**
 * The initial builder handed to a range callback.
 *
 * @experimental
 */
export const builder = <
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
>(): Builder<ConvexDoc, FieldPaths> => makeBuilder<ConvexDoc, FieldPaths>([]);

/**
 * Number of index fields pinned by equality constraints.
 */
export const equalityPrefixLength = (self: QueryStreamIndexRange): number =>
  self[TypeId].equalities.length;

interface ConvexUpperBoundBuilder extends ConvexIndexRange {
  readonly lt: (
    fieldPath: string,
    value: QueryStreamOrderKey.KeyValue,
  ) => ConvexIndexRange;
  readonly lte: (
    fieldPath: string,
    value: QueryStreamOrderKey.KeyValue,
  ) => ConvexIndexRange;
}

interface ConvexRangeBuilder extends ConvexUpperBoundBuilder {
  readonly eq: (
    fieldPath: string,
    value: QueryStreamOrderKey.KeyValue,
  ) => ConvexRangeBuilder;
  readonly gt: (
    fieldPath: string,
    value: QueryStreamOrderKey.KeyValue,
  ) => ConvexUpperBoundBuilder;
  readonly gte: (
    fieldPath: string,
    value: QueryStreamOrderKey.KeyValue,
  ) => ConvexUpperBoundBuilder;
}

/**
 * Apply one range to Convex's index-range builder.
 */
export const apply = (
  self: QueryStreamIndexRange,
  q: ConvexIndexRangeBuilder<GenericDocument, string[]>,
): ConvexIndexRange => {
  const { equalities, bounded } = self[TypeId];

  // SAFETY: Convex tracks equality progress through a static field tuple. These paths
  // are runtime data; the range model owns their ordering. Its runtime builder
  // supports further equality calls, even when the SDK type has lost the tuple.
  const prefix = Array.reduce(
    equalities,
    q as ConvexRangeBuilder,
    (target, { fieldPath, value }) => target.eq(fieldPath, value),
  );

  return Option.match(bounded, {
    onNone: () => prefix,
    onSome: ({ fieldPath, interval }) => {
      const lower = (
        target: ConvexRangeBuilder,
        endpoint: Endpoint,
      ): ConvexUpperBoundBuilder =>
        target[endpoint.inclusive ? "gte" : "gt"](fieldPath, endpoint.value);

      const upper = (
        target: ConvexUpperBoundBuilder,
        endpoint: Endpoint,
      ): ConvexIndexRange =>
        target[endpoint.inclusive ? "lte" : "lt"](fieldPath, endpoint.value);

      return Interval.$match(interval, {
        Lower: ({ lower: endpoint }) => lower(prefix, endpoint),
        Upper: ({ upper: endpoint }) => upper(prefix, endpoint),
        Between: (endpoints) =>
          upper(lower(prefix, endpoints.lower), endpoints.upper),
      });
    },
  });
};

// Convex index ranges have the shape `eq(f1) … eq(fn), gt/gte(fm)?,
// lt/lte(fm)?`—every field path pinned except the last, which may carry two
// inequalities. An arbitrary range between two index keys therefore
// decomposes into a *sequence* of Convex-expressible ranges (the port of
// `convex-helpers`' `splitRange`): e.g. `(1, 2, 3) < key <= (1, 3, 2)` over
// field paths `(f1, f2, f3)` becomes
//
//   1. eq(f1, 1), eq(f2, 2), gt(f3, 3)
//   2. eq(f1, 1), gt(f2, 2), lt(f2, 3)
//   3. eq(f1, 1), eq(f2, 3), lte(f3, 2)

type BoundTag = "gt" | "gte" | "lt" | "lte";

class TaggedBound extends Data.Class<{
  readonly indexEntries: QueryStreamIndexPrefix.IndexEntries;
  readonly tag: BoundTag;
}> {}

/**
 * Dropping a bound's last entry bounds the remaining prefix exclusively.
 */
const excludePrefix = (tag: BoundTag): BoundTag =>
  Match.value(tag).pipe(
    Match.whenOr("gt", "gte", () => "gt" as const),
    Match.whenOr("lt", "lte", () => "lt" as const),
    Match.exhaustive,
  );

/**
 * Peel a bound down to the single entry that feeds the middle range.
 */
const peelBound = (
  indexEntries: QueryStreamIndexPrefix.IndexEntries,
  tag: BoundTag,
): {
  readonly peeled: ReadonlyArray<TaggedBound>;
  readonly final: TaggedBound;
} =>
  indexEntries.length <= 1
    ? { peeled: [], final: new TaggedBound({ indexEntries, tag }) }
    : pipe(
        peelBound(Array.dropRight(indexEntries, 1), excludePrefix(tag)),
        ({ final, peeled }) => ({
          peeled: Array.prepend(peeled, new TaggedBound({ indexEntries, tag })),
          final,
        }),
      );

/**
 * Pin every entry but the last, which gets the bound tag.
 */
const rangeFor = (
  prefix: ReadonlyArray<Equality>,
  indexEntries: QueryStreamIndexPrefix.IndexEntries,
  tag: BoundTag,
): QueryStreamIndexRange =>
  Option.match(Array.last(indexEntries), {
    onNone: () => make({ equalities: prefix, bounded: Option.none() }),
    onSome: ([fieldPath, value]) =>
      make({
        equalities: Array.appendAll(
          prefix,
          Array.map(Array.dropRight(indexEntries, 1), ([path, pinned]) => ({
            fieldPath: path,
            value: pinned,
          })),
        ),
        bounded: Option.some({
          fieldPath,
          interval:
            tag === "gt" || tag === "gte"
              ? Interval.Lower({ lower: { value, inclusive: tag === "gte" } })
              : Interval.Upper({ upper: { value, inclusive: tag === "lte" } }),
        }),
      }),
  });

/**
 * Decompose the range between `bounds.lower` and `bounds.upper` (over the
 * complete index `fieldPaths`, `_id` tiebreaker included) into a sequence of
 * Convex-expressible ranges, ordered for the given direction.
 *
 * @experimental
 */
export const fromBounds = (
  fieldPaths: ReadonlyArray<string>,
  order: OrderDirection,
  bounds: IndexBounds,
): Result.Result<
  ReadonlyArray<QueryStreamIndexRange>,
  QueryStreamIndexPrefix.IndexPrefixWidthMismatchError
> =>
  Result.gen(function* () {
    const lowerIndexEntries = QueryStreamIndexPrefix.entries(
      yield* QueryStreamIndexPrefix.make(fieldPaths, bounds.lower.orderKey),
    );

    const upperIndexEntries = QueryStreamIndexPrefix.entries(
      yield* QueryStreamIndexPrefix.make(fieldPaths, bounds.upper.orderKey),
    );

    // Equal cuts are an empty range too: e.g. lower exclusive at `k` and
    // upper inclusive at `k`—the half-open (k, k]—both cut at
    // successor(k).
    if (QueryStreamKeyBounds.isEmpty(bounds)) {
      return [];
    }

    const commonLength = pipe(
      Array.zip(bounds.lower.orderKey, bounds.upper.orderKey),
      Array.takeWhile(
        ([lowerValue, upperValue]) =>
          QueryStreamOrderKey.ValueOrder(lowerValue, upperValue) === 0,
      ),
      Array.length,
    );

    const equalities = pipe(
      Array.take(lowerIndexEntries, commonLength),
      Array.map(([fieldPath, value]) => ({ fieldPath, value })),
    );

    const lower = peelBound(
      Array.drop(lowerIndexEntries, commonLength),
      bounds.lower.inclusive ? "gte" : "gt",
    );

    const upper = peelBound(
      Array.drop(upperIndexEntries, commonLength),
      bounds.upper.inclusive ? "lte" : "lt",
    );

    const startRanges = Array.map(lower.peeled, ({ indexEntries, tag }) =>
      rangeFor(equalities, indexEntries, tag),
    );

    const endRanges = Array.reverse(
      Array.map(upper.peeled, ({ indexEntries, tag }) =>
        rangeFor(equalities, indexEntries, tag),
      ),
    );

    const { indexEntries: lowerFinalIndexEntries, tag: lowerFinalTag } =
      lower.final;

    const { indexEntries: upperFinalIndexEntries, tag: upperFinalTag } =
      upper.final;

    const middleRange =
      Array.isReadonlyArrayNonEmpty(lowerFinalIndexEntries) &&
      Array.isReadonlyArrayNonEmpty(upperFinalIndexEntries)
        ? make({
            equalities,
            bounded: Option.some({
              fieldPath: Array.headNonEmpty(lowerFinalIndexEntries)[0],
              interval: Interval.Between({
                lower: {
                  value: Array.headNonEmpty(lowerFinalIndexEntries)[1],
                  inclusive: lowerFinalTag === "gte",
                },
                upper: {
                  value: Array.headNonEmpty(upperFinalIndexEntries)[1],
                  inclusive: upperFinalTag === "lte",
                },
              }),
            }),
          })
        : Array.isReadonlyArrayNonEmpty(lowerFinalIndexEntries)
          ? rangeFor(equalities, lowerFinalIndexEntries, lowerFinalTag)
          : rangeFor(equalities, upperFinalIndexEntries, upperFinalTag);

    const ranges = Array.appendAll(
      Array.appendAll(startRanges, Array.of(middleRange)),
      endRanges,
    );

    return order === "desc" ? Array.reverse(ranges) : ranges;
  });

/**
 * Derive full-index bounds directly from the structural range.
 */
export const toBounds = (self: QueryStreamIndexRange): IndexBounds => {
  const { equalities, bounded } = self[TypeId];
  const orderKey = Array.map(equalities, (equality) => equality.value);
  const unbounded = { orderKey, inclusive: true };

  const endpoint = ({ value, inclusive }: Endpoint) => ({
    orderKey: Array.append(orderKey, value),
    inclusive,
  });

  return Option.match(bounded, {
    onNone: () => ({ lower: unbounded, upper: unbounded }),
    onSome: ({ interval }) =>
      Interval.$match(interval, {
        Lower: ({ lower }) => ({ lower: endpoint(lower), upper: unbounded }),
        Upper: ({ upper }) => ({ lower: unbounded, upper: endpoint(upper) }),
        Between: ({ lower, upper }) => ({
          lower: endpoint(lower),
          upper: endpoint(upper),
        }),
      }),
  });
};
