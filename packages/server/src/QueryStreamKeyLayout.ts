import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Equivalence_ from "effect/Equivalence";
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
 * Describes the positions in a stream's keys: their sequence, their labels, and
 * where implicit document-ID tiebreakers occur. Every element has its own key
 * values; the stream has one shared layout.
 *
 * For example, labels `["text", "_creationTime"]` describe the labeled
 * positions in a key such as `["apple", 1, "n1"]`. Its layout also records the
 * final implicit ID position. Joined layouts retain each component's ID, so
 * their labels alone do not describe every key position.
 *
 * Layouts are compatible when they have the same total width, labels in the
 * same positions, and implicit-ID positions. Direction is separate. Layouts
 * contain no key values, value-type schemas, table identity, or equality-pinned
 * values. Labels start as index field paths but may be renamed. An explicit ID,
 * such as in `by_id`, has a label.
 *
 * Reuse a stream's `keyLayout` with `empty` or `flatMap`'s `innerKeyLayout`.
 * Creating a stream to obtain its layout does not read documents. The
 * `KeyLabels` parameter tracks only labels; implicit-ID positions are checked
 * at runtime. Normally this type is inferred from the source stream.
 *
 * @experimental
 */
export interface QueryStreamKeyLayout<
  out KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels =
    QueryStreamKeyLabels.QueryStreamKeyLabels,
> {
  readonly [TypeId]: {
    readonly _Labels: Types.Covariant<KeyLabels>;
    readonly positions: ReadonlyArray<Position>;
  };
}

// Private construction keeps the visible label witness with the operations
// that derive it from index fields, concatenation, or renaming.
const make = <KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels>(
  positions: ReadonlyArray<Position>,
): QueryStreamKeyLayout<KeyLabels> => ({
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
  readonly keyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
  readonly prefixKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
}> {
  override get message(): string {
    return `Labels ([${Array.join(this.prefixKeyLabels, ", ")}]) must be a prefix of the ordering labels ([${Array.join(this.keyLabels, ", ")}])`;
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
  readonly keyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
  readonly replacementKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
}> {
  override get message(): string {
    return `Replacement labels ([${Array.join(this.replacementKeyLabels, ", ")}]) must have as many labels as the ordering labels ([${Array.join(this.keyLabels, ", ")}])`;
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
  QueryStreamKeyLayout<QueryStreamKeyLabels.QueryStreamKeyLabels<FieldPaths>>,
  InvalidEqualityPrefixError
>;
export function fromIndex<
  const FieldPaths extends ReadonlyArray<string>,
  const Count extends number,
>(
  fieldPaths: FieldPaths,
  eqCount: Count,
): Result.Result<
  QueryStreamKeyLayout<
    QueryStreamKeyLabels.QueryStreamKeyLabels<
      RemainingFieldPaths<FieldPaths, Count>
    >
  >,
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
  LeftKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  RightKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
>(
  self: QueryStreamKeyLayout<LeftKeyLabels>,
  that: QueryStreamKeyLayout<RightKeyLabels>,
): QueryStreamKeyLayout<
  QueryStreamKeyLabels.Concat<LeftKeyLabels, RightKeyLabels>
> => make(Array.appendAll(positions(self), positions(that)));

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
export function visibleLabels<
  KeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
>(self: QueryStreamKeyLayout<KeyLabels>): KeyLabels;
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

// Runtime offsets of visible labels, used to resolve label prefixes.
const visiblePositions = (self: QueryStreamKeyLayout): ReadonlyArray<number> =>
  Array.filterMap(positions(self), (position, index) =>
    Position.$is("Visible")(position) ? Result.succeed(index) : Result.failVoid,
  );

const PositionsEquivalence = Equivalence_.Array<Position>((self, that) =>
  Position.$match(self, {
    Visible: ({ label }) =>
      Position.$is("Visible")(that) && label === that.label,
    ImplicitId: () => Position.$is("ImplicitId")(that),
  }),
);

/**
 * @experimental
 */
export const Equivalence: Equivalence_.Equivalence<QueryStreamKeyLayout> =
  Equivalence_.mapInput(PositionsEquivalence, positions);

export class KeyLayoutMismatchError extends Data.TaggedError(
  "KeyLayoutMismatchError",
)<{
  readonly expectedKeyLayout: QueryStreamKeyLayout;
  readonly actualKeyLayout: QueryStreamKeyLayout;
}> {
  override get message(): string {
    return `Key layout (${format(this.actualKeyLayout)}) does not match the expected layout (${format(this.expectedKeyLayout)})`;
  }
}

export const validateEquivalence = (
  expectedKeyLayout: QueryStreamKeyLayout,
  actualKeyLayout: QueryStreamKeyLayout,
): Result.Result<void, KeyLayoutMismatchError> =>
  Equivalence(expectedKeyLayout, actualKeyLayout)
    ? Result.succeed(undefined)
    : Result.fail(
        new KeyLayoutMismatchError({ expectedKeyLayout, actualKeyLayout }),
      );

/**
 * Parse a visible label prefix and resolve its runtime width. Implicit IDs
 * before the last selected label are included; implicit IDs after it are not.
 *
 * @experimental
 */
export const resolvePrefix = (
  self: QueryStreamKeyLayout,
  prefixKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels,
): Result.Result<number, InvalidLabelPrefixError> => {
  const keyLabels = visibleLabels(self);
  if (!QueryStreamKeyLabels.hasPrefix(keyLabels, prefixKeyLabels)) {
    return Result.fail(
      new InvalidLabelPrefixError({ keyLabels, prefixKeyLabels }),
    );
  }
  return Result.succeed(
    Option.match(
      Array.get(visiblePositions(self), prefixKeyLabels.length - 1),
      {
        onNone: () => 0,
        onSome: (position) => position + 1,
      },
    ),
  );
};

/**
 * Relabel visible positions, preserving every implicit ID.
 *
 * @experimental
 */
export const rename = <
  ReplacementKeyLabels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
>(
  self: QueryStreamKeyLayout,
  replacementKeyLabels: ReplacementKeyLabels,
): Result.Result<
  QueryStreamKeyLayout<ReplacementKeyLabels>,
  LabelCountMismatchError
> => {
  const [consumed, renamed] = Array.mapAccum(
    positions(self),
    0,
    (index, position): readonly [number, Option.Option<Position>] =>
      Position.$match(position, {
        ImplicitId: () => [index, Option.some(position)] as const,
        Visible: () =>
          [
            index + 1,
            Option.map(Array.get(replacementKeyLabels, index), (label) =>
              Position.Visible({ label }),
            ),
          ] as const,
      }),
  );
  const parsed =
    consumed === replacementKeyLabels.length
      ? Option.all(renamed)
      : Option.none();
  return Result.fromOption(
    Option.map(parsed, make<ReplacementKeyLabels>),
    () =>
      new LabelCountMismatchError({
        keyLabels: visibleLabels(self),
        replacementKeyLabels,
      }),
  );
};
