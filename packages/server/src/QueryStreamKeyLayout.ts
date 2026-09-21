import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Equivalence from "effect/Equivalence";
import { identity } from "effect/Function";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type * as Types from "effect/Types";

import * as QueryStreamKeyLabels from "./QueryStreamKeyLabels";

/**
 * A sequence of key positions. An implicit ID can only terminate a segment; an
 * explicit segment contains only visible positions, including an explicit ID or
 * its alias. Empty keys have no segments.
 *
 * @experimental
 */
export type Segment = Data.TaggedEnum<{
  WithImplicitId: {
    readonly keyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
  };
  Explicit: {
    readonly keyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels<
      Array.NonEmptyReadonlyArray<string>
    >;
  };
}>;

const Segment = Data.taggedEnum<Segment>();
const TypeId = "@confect/server/QueryStreamKeyLayout";

/**
 * Describes the positions in a stream's order keys: their sequence, their
 * labels, and where implicit document-ID tiebreakers occur. Every element has
 * its own key values; the stream has one shared layout.
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
 * Internally, segments preserve IDs during concatenation; compatibility depends
 * on positions and labels, independently of segment boundaries.
 *
 * @experimental
 */
export interface QueryStreamKeyLayout<
  out KeyLabels extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  readonly [TypeId]: {
    readonly _Labels: Types.Covariant<KeyLabels>;
    readonly segments: ReadonlyArray<Segment>;
  };
}

// Private construction keeps the labels and runtime positions with the operations
// that derive it from index fields, concatenation, or renaming.
const make = <KeyLabels extends ReadonlyArray<string>>(
  segments: ReadonlyArray<Segment>,
): QueryStreamKeyLayout<KeyLabels> => ({
  [TypeId]: { _Labels: identity, segments },
});

/**
 * The component segments, including their implicit ID positions.
 *
 * @experimental
 */
export const segments = (self: QueryStreamKeyLayout): ReadonlyArray<Segment> =>
  self[TypeId].segments;

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
    return `Labels ([${Array.join(QueryStreamKeyLabels.toArray(this.prefixKeyLabels), ", ")}]) must be a prefix of the ordering labels ([${Array.join(QueryStreamKeyLabels.toArray(this.keyLabels), ", ")}])`;
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
    return `Replacement labels ([${Array.join(QueryStreamKeyLabels.toArray(this.replacementKeyLabels), ", ")}]) must have as many labels as the ordering labels ([${Array.join(QueryStreamKeyLabels.toArray(this.keyLabels), ", ")}])`;
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
  const keyLabels = Array.drop(fieldPaths, eqCount);
  const componentSegments: ReadonlyArray<Segment> = Option.exists(
    Array.last(fieldPaths),
    (fieldPath) => fieldPath === "_id",
  )
    ? Array.match(keyLabels, {
        onEmpty: () => [],
        onNonEmpty: (explicitLabels) => [
          Segment.Explicit({
            keyLabels: QueryStreamKeyLabels.make(explicitLabels),
          }),
        ],
      })
    : [
        Segment.WithImplicitId({
          keyLabels: QueryStreamKeyLabels.make(keyLabels),
        }),
      ];
  return Result.succeed(make(componentSegments));
}

/**
 * Concatenate layouts without losing component tiebreakers.
 *
 * @experimental
 */
export const concat = <
  LeftKeyLabels extends ReadonlyArray<string>,
  RightKeyLabels extends ReadonlyArray<string>,
>(
  self: QueryStreamKeyLayout<LeftKeyLabels>,
  that: QueryStreamKeyLayout<RightKeyLabels>,
): QueryStreamKeyLayout<readonly [...LeftKeyLabels, ...RightKeyLabels]> =>
  make(Array.appendAll(segments(self), segments(that)));

/**
 * Format visible labels and implicit IDs for diagnostics.
 *
 * @experimental
 */
export const format = (self: QueryStreamKeyLayout): string => {
  const quoteLabels = (keyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels) =>
    Array.map(QueryStreamKeyLabels.toArray(keyLabels), (label) =>
      JSON.stringify(label),
    );
  const tokens = Array.flatMap(
    segments(self),
    Segment.$match({
      WithImplicitId: ({ keyLabels }) =>
        Array.append(quoteLabels(keyLabels), "<implicit _id>"),
      Explicit: ({ keyLabels }) => quoteLabels(keyLabels),
    }),
  );
  return `[${Array.join(tokens, ", ")}]`;
};

/**
 * The labels available to `distinct` and `renameKey`.
 *
 * @experimental
 */
export function visibleLabels<KeyLabels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLayout<KeyLabels>,
): QueryStreamKeyLabels.QueryStreamKeyLabels<KeyLabels>;
export function visibleLabels(
  self: QueryStreamKeyLayout,
): QueryStreamKeyLabels.QueryStreamKeyLabels {
  return Array.reduce(
    segments(self),
    QueryStreamKeyLabels.make<ReadonlyArray<string>>([]),
    (keyLabels, segment) =>
      QueryStreamKeyLabels.concat(keyLabels, segment.keyLabels),
  );
}

const segmentWidth = Segment.$match({
  WithImplicitId: ({ keyLabels }) => QueryStreamKeyLabels.size(keyLabels) + 1,
  Explicit: ({ keyLabels }) => QueryStreamKeyLabels.size(keyLabels),
});

/**
 * Number of positions in an element's runtime key.
 *
 * @experimental
 */
export const runtimeWidth = (self: QueryStreamKeyLayout): number =>
  Array.reduce(
    segments(self),
    0,
    (width, segment) => width + segmentWidth(segment),
  );

// Runtime positions of visible labels, used to compare layouts and resolve
// prefixes across component boundaries. Label equality belongs to KeyLabels.
const visiblePositions = (
  self: QueryStreamKeyLayout,
): ReadonlyArray<number> => {
  const [, groups] = Array.mapAccum(segments(self), 0, (offset, segment) => [
    offset + segmentWidth(segment),
    Array.map(
      QueryStreamKeyLabels.toArray(segment.keyLabels),
      (_, index) => offset + index,
    ),
  ]);
  return Array.flatten(groups);
};

const PositionsEquivalence = Equivalence.Array(Equivalence.Number);

/**
 * Compare labels and implicit positions, independently of segmentation.
 *
 * @experimental
 */
export const compatible = (
  self: QueryStreamKeyLayout,
  that: QueryStreamKeyLayout,
): boolean =>
  runtimeWidth(self) === runtimeWidth(that) &&
  QueryStreamKeyLabels.Equivalence(visibleLabels(self), visibleLabels(that)) &&
  PositionsEquivalence(visiblePositions(self), visiblePositions(that));

/**
 * Resolve a label prefix to the width of its key-value prefix. Implicit IDs
 * before the last selected label are included; those after it are not.
 *
 * @experimental
 */
export const resolvePrefix = (
  self: QueryStreamKeyLayout,
  prefixKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels,
): Result.Result<number, InvalidLabelPrefixError> => {
  const keyLabels = visibleLabels(self);
  return Option.match(
    QueryStreamKeyLabels.stripPrefix(keyLabels, prefixKeyLabels),
    {
      onNone: () =>
        Result.fail(
          new InvalidLabelPrefixError({ keyLabels, prefixKeyLabels }),
        ),
      onSome: (remainingKeyLabels) => {
        const prefix = Array.take(
          visiblePositions(self),
          QueryStreamKeyLabels.size(keyLabels) -
            QueryStreamKeyLabels.size(remainingKeyLabels),
        );
        return Result.succeed(
          Option.match(Array.last(prefix), {
            onNone: () => 0,
            onSome: (position) => position + 1,
          }),
        );
      },
    },
  );
};

// Parsing returns the rebuilt segment, retaining the Explicit case's nonempty
// labels. No later indexing or nonempty assertion is needed to rename it.
const consumeSegment = (
  replacementKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels,
  segment: Segment,
) =>
  Segment.$match(segment, {
    WithImplicitId: ({ keyLabels }) =>
      Option.map(
        QueryStreamKeyLabels.consume(replacementKeyLabels, keyLabels),
        ({ prefixKeyLabels, remainingKeyLabels }) => ({
          segment: Segment.WithImplicitId({ keyLabels: prefixKeyLabels }),
          remainingKeyLabels,
        }),
      ),
    Explicit: ({ keyLabels }) =>
      Option.map(
        QueryStreamKeyLabels.consume(replacementKeyLabels, keyLabels),
        ({ prefixKeyLabels, remainingKeyLabels }) => ({
          segment: Segment.Explicit({ keyLabels: prefixKeyLabels }),
          remainingKeyLabels,
        }),
      ),
  });

/**
 * Relabel visible positions, preserving every implicit ID.
 *
 * @experimental
 */
export const rename = <ReplacementKeyLabels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLayout,
  replacementKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels<ReplacementKeyLabels>,
): Result.Result<
  QueryStreamKeyLayout<Types.Mutable<ReplacementKeyLabels>>,
  LabelCountMismatchError
> => {
  const consumed = Array.reduce(
    segments(self),
    Option.some<{
      readonly remainingKeyLabels: QueryStreamKeyLabels.QueryStreamKeyLabels;
      readonly segments: ReadonlyArray<Segment>;
    }>({ remainingKeyLabels: replacementKeyLabels, segments: [] }),
    (state, segment) =>
      Option.flatMap(
        state,
        ({ remainingKeyLabels, segments: componentSegments }) =>
          Option.map(consumeSegment(remainingKeyLabels, segment), (parsed) => ({
            remainingKeyLabels: parsed.remainingKeyLabels,
            segments: Array.append(componentSegments, parsed.segment),
          })),
      ),
  );
  const parsed = consumed.pipe(
    Option.filter(
      ({ remainingKeyLabels }) =>
        QueryStreamKeyLabels.size(remainingKeyLabels) === 0,
    ),
    Option.map(({ segments: componentSegments }) =>
      make<Types.Mutable<ReplacementKeyLabels>>(componentSegments),
    ),
  );
  return Result.fromOption(
    parsed,
    () =>
      new LabelCountMismatchError({
        keyLabels: visibleLabels(self),
        replacementKeyLabels,
      }),
  );
};
