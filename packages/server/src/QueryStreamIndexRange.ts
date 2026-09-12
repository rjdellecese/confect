import type { GenericDocument, FieldTypeFromFieldPath } from "convex/server";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import { identity, pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import type * as Types from "effect/Types";
import * as QueryStreamKeyBounds from "./QueryStreamKeyBounds";
import type { IndexBounds } from "./QueryStreamKeyBounds";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";
import type { QueryStreamOrderKey as OrderKey } from "./QueryStreamOrderKey";
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

/**
 * Complete the source index paths with Convex's implicit ID tiebreaker.
 * These paths address the encoded document and are never ordering aliases.
 * @experimental
 */
export const completeFieldPaths = (
  fieldPaths: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Option.exists(Array.last(fieldPaths), (fieldPath) => fieldPath === "_id")
    ? fieldPaths
    : Array.append(fieldPaths, "_id");

// The range builder mirrors Convex's `IndexRangeBuilder`, but *consumes* the
// index-field tuple at the type level as `eq` pins field paths. The remaining
// tuple supplies the initial visible ordering labels of the resulting stream.

const RangeSpecTypeId = "~@confect/server/QueryStream/IndexRangeSpec";

/**
 * @experimental
 */
export type RangeOp = Data.TaggedEnum<{
  [Tag in "eq" | "gt" | "gte" | "lt" | "lte"]: {
    readonly field: string;
    readonly value: QueryStreamOrderKey.KeyValue;
  };
}>;

const RangeOp = Data.taggedEnum<RangeOp>();

/**
 * The result of applying a range callback: the recorded operations, plus a
 * phantom `Remaining`—the index field paths not consumed by `eq` pinning.
 *
 * @experimental
 */
export interface IndexRangeSpec<out FieldPaths extends ReadonlyArray<string>> {
  readonly [RangeSpecTypeId]: {
    readonly _Remaining: Types.Covariant<FieldPaths>;
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

/**
 * A typed index-range builder. `eq` must target the next unpinned index
 * field, and consumes it; `gt`/`gte`/`lt`/`lte` bound the next field without
 * consuming it (bounded field paths still vary within the range).
 *
 * @experimental
 */
export interface RangeBuilder<
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
> extends IndexRangeSpec<FieldPaths> {
  readonly eq: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => RangeBuilder<ConvexDoc, Tail<FieldPaths>>;
  readonly gt: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => LowerBoundedRange<ConvexDoc, FieldPaths>;
  readonly gte: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => LowerBoundedRange<ConvexDoc, FieldPaths>;
  readonly lt: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => IndexRangeSpec<FieldPaths>;
  readonly lte: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => IndexRangeSpec<FieldPaths>;
}

/**
 * After `gt`/`gte`, only an upper bound on the same field may follow.
 *
 * @experimental
 */
export interface LowerBoundedRange<
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
> extends IndexRangeSpec<FieldPaths> {
  readonly lt: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => IndexRangeSpec<FieldPaths>;
  readonly lte: (
    fieldPath: Head<FieldPaths>,
    value: FieldTypeFromFieldPath<ConvexDoc, Head<FieldPaths>>,
  ) => IndexRangeSpec<FieldPaths>;
}

const makeRangeBuilder = (
  ops: ReadonlyArray<RangeOp>,
): RangeBuilder<GenericDocument, ReadonlyArray<string>> => {
  const push =
    (tag: RangeOp["_tag"]) =>
    (fieldPath: string, value: QueryStreamOrderKey.KeyValue) =>
      makeRangeBuilder(
        Array.append(ops, RangeOp[tag]({ field: fieldPath, value })),
      );

  return {
    [RangeSpecTypeId]: {
      _Remaining: identity as Types.Covariant<ReadonlyArray<string>>,
    },
    get eqCount() {
      return Array.takeWhile(ops, (op) => op._tag === "eq").length;
    },
    ops,
    eq: push("eq"),
    gt: push("gt"),
    gte: push("gte"),
    lt: push("lt"),
    lte: push("lte"),
  };
};

/**
 * The initial builder handed to a range callback.
 *
 * @experimental
 */
export const rangeBuilder = <
  ConvexDoc extends GenericDocument,
  FieldPaths extends ReadonlyArray<string>,
>(): RangeBuilder<ConvexDoc, FieldPaths> =>
  makeRangeBuilder([]) as unknown as RangeBuilder<ConvexDoc, FieldPaths>;

/**
 * Replay recorded range ops onto Convex's real `IndexRangeBuilder`.
 *
 * @experimental
 */
export const applyOps = (ops: ReadonlyArray<RangeOp>, q: any): any =>
  Array.reduce(ops, q, (builder, op) => builder[op._tag](op.field, op.value));

/**
 * Replay a recorded range spec onto Convex's real `IndexRangeBuilder`.
 *
 * @experimental
 */
export const applyRange = (spec: AnyIndexRangeSpec, q: any): any =>
  applyOps(spec.ops, q);

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
  readonly key: OrderKey;
  readonly tag: BoundTag;
}> {}

/** Dropping a bound key's last component bounds by the remaining prefix—exclusively. */
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
  readonly peeled: ReadonlyArray<TaggedBound>;
  readonly final: TaggedBound;
} =>
  key.length <= 1
    ? { peeled: [], final: new TaggedBound({ key, tag }) }
    : pipe(
        peelBound(Array.dropRight(key, 1), excludePrefix(tag)),
        ({ final, peeled }) => ({
          peeled: Array.prepend(peeled, new TaggedBound({ key, tag })),
          final,
        }),
      );

/** `eq` every component of `key` but the last, which gets the bound tag. */
const rangeOpsFor = (
  prefixOps: ReadonlyArray<RangeOp>,
  fieldPaths: ReadonlyArray<string>,
  key: OrderKey,
  tag: BoundTag,
): ReadonlyArray<RangeOp> =>
  Option.match(Array.last(key), {
    onNone: () => prefixOps,
    onSome: (lastValue) =>
      pipe(
        Array.zip(fieldPaths, Array.dropRight(key, 1)),
        Array.map(([fieldPath, value]) =>
          RangeOp.eq({ field: fieldPath, value }),
        ),
        (eqOps) =>
          Array.appendAll(
            Array.appendAll(prefixOps, eqOps),
            Array.of(
              RangeOp[tag]({
                field: fieldPaths[key.length - 1]!,
                value: lastValue,
              }),
            ),
          ),
      ),
  });

/**
 * Decompose the range between `bounds.lower` and `bounds.upper` (over the
 * complete index `fieldPaths`, `_id` tiebreaker included) into a sequence of
 * Convex-expressible ranges, ordered for the given direction.
 *
 * @experimental
 */
export const splitRange = (
  fieldPaths: ReadonlyArray<string>,
  order: OrderDirection,
  bounds: IndexBounds,
): ReadonlyArray<ReadonlyArray<RangeOp>> => {
  // Equal cuts are an empty range too: e.g. lower exclusive at `k` and
  // upper inclusive at `k`—the half-open (k, k]—both cut at
  // successor(k).
  if (QueryStreamKeyBounds.isEmpty(bounds)) {
    return [];
  }

  const commonLength = pipe(
    Array.zip(bounds.lower.key, bounds.upper.key),
    Array.takeWhile(
      ([lowerValue, upperValue]) =>
        QueryStreamOrderKey.ValueOrder(lowerValue, upperValue) === 0,
    ),
  ).length;
  const prefixOps = pipe(
    Array.zip(Array.take(fieldPaths, commonLength), bounds.lower.key),
    Array.map(([fieldPath, value]) => RangeOp.eq({ field: fieldPath, value })),
  );
  const restFieldPaths = Array.drop(fieldPaths, commonLength);

  const lower = peelBound(
    Array.drop(bounds.lower.key, commonLength),
    bounds.lower.inclusive ? "gte" : "gt",
  );
  const upper = peelBound(
    Array.drop(bounds.upper.key, commonLength),
    bounds.upper.inclusive ? "lte" : "lt",
  );

  const startRanges = Array.map(lower.peeled, ({ key, tag }) =>
    rangeOpsFor(prefixOps, restFieldPaths, key, tag),
  );
  const endRanges = Array.reverse(
    Array.map(upper.peeled, ({ key, tag }) =>
      rangeOpsFor(prefixOps, restFieldPaths, key, tag),
    ),
  );

  const { key: lowerFinalKey, tag: lowerFinalTag } = lower.final;
  const { key: upperFinalKey, tag: upperFinalTag } = upper.final;
  const middleRange =
    Array.isReadonlyArrayNonEmpty(lowerFinalKey) &&
    Array.isReadonlyArrayNonEmpty(upperFinalKey)
      ? Array.appendAll(prefixOps, [
          RangeOp[lowerFinalTag]({
            field: restFieldPaths[0]!,
            value: Array.headNonEmpty(lowerFinalKey),
          }),
          RangeOp[upperFinalTag]({
            field: restFieldPaths[0]!,
            value: Array.headNonEmpty(upperFinalKey),
          }),
        ])
      : Array.isReadonlyArrayNonEmpty(lowerFinalKey)
        ? rangeOpsFor(prefixOps, restFieldPaths, lowerFinalKey, lowerFinalTag)
        : rangeOpsFor(prefixOps, restFieldPaths, upperFinalKey, upperFinalTag);

  const ranges = Array.appendAll(
    Array.appendAll(startRanges, Array.of(middleRange)),
    endRanges,
  );
  return order === "desc" ? Array.reverse(ranges) : ranges;
};

/**
 * Fold a range spec's recorded ops into full-index-key bounds.
 *
 * @experimental
 */
export const boundsFromSpec = (spec: AnyIndexRangeSpec): IndexBounds =>
  Array.reduce(
    spec.ops,
    {
      lower: {
        key: Array.empty<QueryStreamOrderKey.KeyValue>(),
        inclusive: true,
      },
      upper: {
        key: Array.empty<QueryStreamOrderKey.KeyValue>(),
        inclusive: true,
      },
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
