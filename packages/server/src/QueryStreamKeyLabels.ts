import * as Array from "effect/Array";
import * as Equivalence_ from "effect/Equivalence";
import * as Option from "effect/Option";

const TypeId = "@confect/server/QueryStreamKeyLabels";

/**
 * Ordered names for the visible components of a stream's ordering key. Names
 * may repeat, and the sequence may be empty. They are aliases, not document
 * field paths; implicit ID positions have no visible label.
 *
 * @experimental
 */
export interface QueryStreamKeyLabels<
  out KeyLabels extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  readonly [TypeId]: Readonly<KeyLabels>;
}

/**
 * Wrap a tuple of names as a labels value.
 *
 * @experimental
 */
export const make = <const KeyLabels extends ReadonlyArray<string>>(
  keyLabels: KeyLabels,
): QueryStreamKeyLabels<KeyLabels> => ({ [TypeId]: keyLabels });

/**
 * Inspect the names in visible key order.
 *
 * @experimental
 */
export const toArray = <KeyLabels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLabels<KeyLabels>,
): Readonly<KeyLabels> => self[TypeId];

/**
 * Number of visible ordering components.
 *
 * @experimental
 */
export const size = (self: QueryStreamKeyLabels): number =>
  toArray(self).length;

const ArrayEquivalence = Equivalence_.Array(Equivalence_.String);

/**
 * Equality includes both label order and multiplicity.
 *
 * @experimental
 */
export const Equivalence: Equivalence_.Equivalence<QueryStreamKeyLabels> =
  Equivalence_.mapInput(ArrayEquivalence, toArray);

/**
 * Concatenate labels, preserving their literal tuple types.
 *
 * @experimental
 */
export function concat<
  LeftKeyLabels extends ReadonlyArray<string>,
  RightKeyLabels extends ReadonlyArray<string>,
>(
  self: QueryStreamKeyLabels<LeftKeyLabels>,
  that: QueryStreamKeyLabels<RightKeyLabels>,
): QueryStreamKeyLabels<readonly [...LeftKeyLabels, ...RightKeyLabels]>;
export function concat(
  self: QueryStreamKeyLabels,
  that: QueryStreamKeyLabels,
): QueryStreamKeyLabels {
  return make(Array.appendAll(toArray(self), toArray(that)));
}

/**
 * Parse a matching prefix, returning the labels left after it. A reordered,
 * skipped, or overlong prefix has no result.
 *
 * @experimental
 */
export const stripPrefix = (
  self: QueryStreamKeyLabels,
  prefixKeyLabels: QueryStreamKeyLabels,
): Option.Option<QueryStreamKeyLabels> =>
  ArrayEquivalence(
    Array.take(toArray(self), size(prefixKeyLabels)),
    toArray(prefixKeyLabels),
  )
    ? Option.some(make(Array.drop(toArray(self), size(prefixKeyLabels))))
    : Option.none();

/**
 * Consume one replacement chunk with the template's tuple shape. The names may
 * differ, but a nonempty template produces a nonempty chunk. Failure means
 * there are too few labels; success also returns the unconsumed labels.
 *
 * @experimental
 */
export function consume<TemplateKeyLabels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLabels,
  templateKeyLabels: QueryStreamKeyLabels<TemplateKeyLabels>,
): Option.Option<{
  readonly prefixKeyLabels: QueryStreamKeyLabels<{
    readonly [K in keyof TemplateKeyLabels]: string;
  }>;
  readonly remainingKeyLabels: QueryStreamKeyLabels;
}>;
export function consume(
  self: QueryStreamKeyLabels,
  templateKeyLabels: QueryStreamKeyLabels,
): Option.Option<{
  readonly prefixKeyLabels: QueryStreamKeyLabels;
  readonly remainingKeyLabels: QueryStreamKeyLabels;
}> {
  if (size(self) < size(templateKeyLabels)) return Option.none();
  const [prefixKeyLabels, remainingKeyLabels] = Array.splitAt(
    toArray(self),
    size(templateKeyLabels),
  );
  return Option.some({
    prefixKeyLabels: make(prefixKeyLabels),
    remainingKeyLabels: make(remainingKeyLabels),
  });
}
