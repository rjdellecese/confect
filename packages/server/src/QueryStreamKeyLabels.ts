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
  out Labels extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  readonly [TypeId]: Readonly<Labels>;
}

/**
 * Wrap a tuple of names as a labels value.
 *
 * @experimental
 */
export const make = <const Labels extends ReadonlyArray<string>>(
  labels: Labels,
): QueryStreamKeyLabels<Labels> => ({ [TypeId]: labels });

/**
 * Inspect the names in visible key order.
 *
 * @experimental
 */
export const toArray = <Labels extends ReadonlyArray<string>>(
  self: QueryStreamKeyLabels<Labels>,
): Readonly<Labels> => self[TypeId];

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
  Left extends ReadonlyArray<string>,
  Right extends ReadonlyArray<string>,
>(
  self: QueryStreamKeyLabels<Left>,
  that: QueryStreamKeyLabels<Right>,
): QueryStreamKeyLabels<readonly [...Left, ...Right]>;
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
  prefix: QueryStreamKeyLabels,
): Option.Option<QueryStreamKeyLabels> =>
  ArrayEquivalence(Array.take(toArray(self), size(prefix)), toArray(prefix))
    ? Option.some(make(Array.drop(toArray(self), size(prefix))))
    : Option.none();

/**
 * Consume one replacement chunk with the template's tuple shape. The names may
 * differ, but a nonempty template produces a nonempty chunk. Failure means
 * there are too few labels; success also returns the unconsumed labels.
 *
 * @experimental
 */
export function consume<Template extends ReadonlyArray<string>>(
  self: QueryStreamKeyLabels,
  template: QueryStreamKeyLabels<Template>,
): Option.Option<{
  readonly prefix: QueryStreamKeyLabels<{
    readonly [K in keyof Template]: string;
  }>;
  readonly rest: QueryStreamKeyLabels;
}>;
export function consume(
  self: QueryStreamKeyLabels,
  template: QueryStreamKeyLabels,
): Option.Option<{
  readonly prefix: QueryStreamKeyLabels;
  readonly rest: QueryStreamKeyLabels;
}> {
  if (size(self) < size(template)) return Option.none();
  const [prefix, rest] = Array.splitAt(toArray(self), size(template));

  return Option.some({ prefix: make(prefix), rest: make(rest) });
}
