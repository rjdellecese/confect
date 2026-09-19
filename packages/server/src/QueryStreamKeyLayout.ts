import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Equivalence from "effect/Equivalence";
import { identity } from "effect/Function";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type * as Types from "effect/Types";

import * as QueryStreamKeyLabels from "./QueryStreamKeyLabels";

/**
 * One runtime position of a stream key. Explicit IDs and their aliases are
 * visible; implicit ID tiebreakers have no label. Empty keys have no
 * positions.
 *
 * @experimental
 */
export type Position = Data.TaggedEnum<{
  Visible: { readonly label: string };
  ImplicitId: {};
}>;

const Position = Data.taggedEnum<Position>();
const TypeId = "@confect/server/QueryStreamKeyLayout";

/**
 * The runtime layout witnessing the visible ordering labels `Labels`. Construct
 * layouts with `fromIndex`, `concat`, and `rename`, or reuse a stream's
 * `keyLayout`.
 *
 * @experimental
 */
export interface QueryStreamKeyLayout<
  out Labels extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  readonly [TypeId]: {
    readonly _Labels: Types.Covariant<Labels>;
    readonly positions: ReadonlyArray<Position>;
  };
}

// Private construction keeps the logical key witness with the operations
// that derive it from index fields, concatenation, or renaming.
const make = <Labels extends ReadonlyArray<string>>(
  positions: ReadonlyArray<Position>,
): QueryStreamKeyLayout<Labels> => ({
  [TypeId]: { _Labels: identity, positions },
});

/**
 * The runtime positions, including implicit ID tiebreakers.
 *
 * @experimental
 */
export const positions = (
  self: QueryStreamKeyLayout,
): ReadonlyArray<Position> => self[TypeId].positions;

/**
 * The source field paths remaining after an equality prefix.
 *
 * @experimental
 */
export type RemainingFieldPaths<
  FieldPaths extends ReadonlyArray<string>,
  Count extends number,
> = Count extends unknown ? DropPrefix<FieldPaths, Count> : never;

type DropPrefix<
  FieldPaths extends ReadonlyArray<string>,
  Count extends number,
  Prefix extends ReadonlyArray<unknown> = [],
> = number extends Count
  ? ReadonlyArray<string>
  : Prefix["length"] extends Count
    ? Types.Mutable<FieldPaths>
    : FieldPaths extends readonly [
          string,
          ...infer TailFieldPaths extends ReadonlyArray<string>,
        ]
      ? DropPrefix<TailFieldPaths, Count, readonly [...Prefix, unknown]>
      : FieldPaths extends readonly []
        ? []
        : ReadonlyArray<string>;

/**
 * The equality prefix cannot select a whole number of source field paths.
 *
 * @experimental
 */
export class InvalidEqualityPrefixError extends Data.TaggedError(
  "InvalidEqualityPrefixError",
)<{
  readonly fieldPaths: ReadonlyArray<string>;
  readonly eqCount: number;
}> {
  override get message(): string {
    return `QueryStreamKeyLayout.fromIndex: invalid equality prefix length (${this.eqCount}) for ${this.fieldPaths.length} field paths`;
  }
}

/**
 * The requested labels do not form a prefix of the layout's visible labels.
 *
 * @experimental
 */
export class InvalidLabelPrefixError extends Data.TaggedError(
  "InvalidLabelPrefixError",
)<{
  readonly labels: QueryStreamKeyLabels.QueryStreamKeyLabels;
  readonly prefixLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
}> {
  override get message(): string {
    return `Labels ([${Array.join(QueryStreamKeyLabels.toArray(this.prefixLabels), ", ")}]) must be a prefix of the ordering labels ([${Array.join(QueryStreamKeyLabels.toArray(this.labels), ", ")}])`;
  }
}

/**
 * The replacement labels cannot fill exactly the layout's visible positions.
 *
 * @experimental
 */
export class LabelCountMismatchError extends Data.TaggedError(
  "LabelCountMismatchError",
)<{
  readonly labels: QueryStreamKeyLabels.QueryStreamKeyLabels;
  readonly replacementLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
}> {
  override get message(): string {
    return `Replacement labels ([${Array.join(QueryStreamKeyLabels.toArray(this.replacementLabels), ", ")}]) must have as many labels as the ordering labels ([${Array.join(QueryStreamKeyLabels.toArray(this.labels), ", ")}])`;
  }
}

/**
 * Construct a scan layout from the original index field paths, before equality
 * pinning. Only an ID absent from the end of that original key is implicit.
 * Pinning every field of `by_id` produces a zero-width layout; pinning every
 * visible field of another index leaves its implicit ID. Invalid equality
 * prefix lengths return `InvalidEqualityPrefixError`.
 *
 * @experimental
 */
export function fromIndex<const FieldPaths extends ReadonlyArray<string>>(
  fieldPaths: FieldPaths,
): Result.Result<
  QueryStreamKeyLayout<Types.Mutable<FieldPaths>>,
  InvalidEqualityPrefixError
>;
export function fromIndex<
  const FieldPaths extends ReadonlyArray<string>,
  const Count extends number,
>(
  fieldPaths: FieldPaths,
  eqCount: Count,
): Result.Result<
  QueryStreamKeyLayout<RemainingFieldPaths<FieldPaths, Count>>,
  InvalidEqualityPrefixError
>;
export function fromIndex(
  fieldPaths: ReadonlyArray<string>,
  eqCount = 0,
): Result.Result<QueryStreamKeyLayout, InvalidEqualityPrefixError> {
  if (
    !Number.isInteger(eqCount) ||
    eqCount < 0 ||
    eqCount > fieldPaths.length
  ) {
    return Result.fail(new InvalidEqualityPrefixError({ fieldPaths, eqCount }));
  }
  const visible = Array.map(Array.drop(fieldPaths, eqCount), (label) =>
    Position.Visible({ label }),
  );
  const keyPositions = Option.exists(
    Array.last(fieldPaths),
    (fieldPath) => fieldPath === "_id",
  )
    ? visible
    : Array.append(visible, Position.ImplicitId());
  return Result.succeed(make(keyPositions));
}

/**
 * Concatenate layouts without losing component tiebreakers.
 *
 * @experimental
 */
export const concat = <
  LeftLabels extends ReadonlyArray<string>,
  RightLabels extends ReadonlyArray<string>,
>(
  self: QueryStreamKeyLayout<LeftLabels>,
  that: QueryStreamKeyLayout<RightLabels>,
): QueryStreamKeyLayout<readonly [...LeftLabels, ...RightLabels]> =>
  make(Array.appendAll(positions(self), positions(that)));

/**
 * Format visible labels and implicit IDs for diagnostics.
 *
 * @experimental
 */
export const format = (self: QueryStreamKeyLayout): string => {
  const tokens = Array.map(
    positions(self),
    Position.$match({
      Visible: ({ label }) => JSON.stringify(label),
      ImplicitId: () => "<implicit _id>",
    }),
  );
  return `[${Array.join(tokens, ", ")}]`;
};

/**
 * The labels available to `distinct` and `renameKey`.
 *
 * @experimental
 */
export function visibleLabels<Labels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLayout<Labels>,
): QueryStreamKeyLabels.QueryStreamKeyLabels<Labels>;
export function visibleLabels(
  self: QueryStreamKeyLayout,
): QueryStreamKeyLabels.QueryStreamKeyLabels {
  return QueryStreamKeyLabels.make(
    Array.filterMap(
      positions(self),
      Position.$match({
        Visible: ({ label }) => Result.succeed(label),
        ImplicitId: () => Result.failVoid,
      }),
    ),
  );
}

/**
 * Number of positions in an element's runtime key.
 *
 * @experimental
 */
export const runtimeWidth = (self: QueryStreamKeyLayout): number =>
  positions(self).length;

// Runtime offsets of visible labels, used to resolve logical prefixes.
const visiblePositions = (self: QueryStreamKeyLayout): ReadonlyArray<number> =>
  Array.filterMap(positions(self), (position, index) =>
    Position.$is("Visible")(position) ? Result.succeed(index) : Result.failVoid,
  );

const PositionsEquivalence = Equivalence.Array<Position>((self, that) =>
  Position.$match(self, {
    Visible: ({ label }) =>
      Position.$is("Visible")(that) && label === that.label,
    ImplicitId: () => Position.$is("ImplicitId")(that),
  }),
);

/**
 * Compare visible labels and implicit positions.
 *
 * @experimental
 */
export const compatible = (
  self: QueryStreamKeyLayout,
  that: QueryStreamKeyLayout,
): boolean => PositionsEquivalence(positions(self), positions(that));

export class KeyLayoutMismatchError extends Data.TaggedError(
  "KeyLayoutMismatchError",
)<{
  readonly expected: QueryStreamKeyLayout;
  readonly actual: QueryStreamKeyLayout;
}> {
  override get message(): string {
    return `Key layout (${format(this.actual)}) does not match the expected layout (${format(this.expected)})`;
  }
}

export const checkCompatible = (
  expected: QueryStreamKeyLayout,
  actual: QueryStreamKeyLayout,
): Result.Result<void, KeyLayoutMismatchError> =>
  expected === actual || compatible(expected, actual)
    ? Result.succeed(undefined)
    : Result.fail(new KeyLayoutMismatchError({ expected, actual }));

/**
 * Parse a logical prefix and resolve its runtime width. Hidden IDs before the
 * last selected label are included; hidden IDs after it are not.
 *
 * @experimental
 */
export const resolvePrefix = (
  self: QueryStreamKeyLayout,
  prefixLabels: QueryStreamKeyLabels.QueryStreamKeyLabels,
): Result.Result<number, InvalidLabelPrefixError> => {
  const labels = visibleLabels(self);
  return Option.match(QueryStreamKeyLabels.stripPrefix(labels, prefixLabels), {
    onNone: () =>
      Result.fail(new InvalidLabelPrefixError({ labels, prefixLabels })),
    onSome: (rest) => {
      const prefix = Array.take(
        visiblePositions(self),
        QueryStreamKeyLabels.size(labels) - QueryStreamKeyLabels.size(rest),
      );
      return Result.succeed(
        Option.match(Array.last(prefix), {
          onNone: () => 0,
          onSome: (position) => position + 1,
        }),
      );
    },
  });
};

/**
 * Relabel visible positions, preserving every implicit ID.
 *
 * @experimental
 */
export const rename = <ReplacementLabels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLayout,
  replacementLabels: QueryStreamKeyLabels.QueryStreamKeyLabels<ReplacementLabels>,
): Result.Result<
  QueryStreamKeyLayout<Types.Mutable<ReplacementLabels>>,
  LabelCountMismatchError
> => {
  const replacements = QueryStreamKeyLabels.toArray(replacementLabels);
  const [consumed, renamed] = Array.mapAccum(
    positions(self),
    0,
    (index, position): readonly [number, Option.Option<Position>] =>
      Position.$match(position, {
        ImplicitId: () => [index, Option.some(position)] as const,
        Visible: () =>
          [
            index + 1,
            Option.map(Array.get(replacements, index), (label) =>
              Position.Visible({ label }),
            ),
          ] as const,
      }),
  );
  const parsed =
    consumed === replacements.length ? Option.all(renamed) : Option.none();
  return Result.fromOption(
    Option.map(parsed, make<Types.Mutable<ReplacementLabels>>),
    () =>
      new LabelCountMismatchError({
        labels: visibleLabels(self),
        replacementLabels,
      }),
  );
};
