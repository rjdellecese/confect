import * as Brand from "effect/Brand";

/**
 * Ordered names for the visible components of a stream's ordering key. Names
 * may repeat, and the sequence may be empty. They are aliases, not document
 * field paths; implicit ID positions have no visible label.
 *
 * @experimental
 */
export type QueryStreamKeyLabels<
  Names extends ReadonlyArray<string> = ReadonlyArray<string>,
> = Readonly<Names> & Brand.Brand<"@confect/server/QueryStreamKeyLabels">;

const LabelsBrand = Brand.nominal<QueryStreamKeyLabels>();

/**
 * Mark a tuple of names as labels without changing its runtime representation.
 *
 * @experimental
 */
export function make<const Names extends ReadonlyArray<string>>(
  names: Names,
): QueryStreamKeyLabels<Names>;
export function make(names: ReadonlyArray<string>): QueryStreamKeyLabels {
  return LabelsBrand(names);
}

/**
 * Check whether the labels start with the given prefix, including order and
 * multiplicity. The empty prefix always matches.
 *
 * @experimental
 */
export const hasPrefix = (
  self: QueryStreamKeyLabels,
  prefix: QueryStreamKeyLabels,
): boolean =>
  prefix.length <= self.length &&
  prefix.every((label, index) => label === self[index]);
