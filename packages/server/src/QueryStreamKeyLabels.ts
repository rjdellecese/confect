import * as Array from "effect/Array";
import * as Equivalence from "effect/Equivalence";
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

const ArrayEquivalence = Equivalence.Array(Equivalence.String);

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
