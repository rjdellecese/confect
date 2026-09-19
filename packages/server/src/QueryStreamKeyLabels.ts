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

/**
 * Check whether the labels start with the given prefix, including order and
 * multiplicity. The empty prefix always matches.
 *
 * @experimental
 */
export const hasPrefix = (
  self: QueryStreamKeyLabels,
  prefix: QueryStreamKeyLabels,
): boolean => {
  const labels = toArray(self);
  const prefixLabels = toArray(prefix);
  return (
    prefixLabels.length <= labels.length &&
    prefixLabels.every((label, index) => label === labels[index])
  );
};
