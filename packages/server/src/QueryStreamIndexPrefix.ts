import * as Schema from "effect/Schema";
import * as Array from "effect/Array";
import * as Result from "effect/Result";
import type * as QueryStreamKey from "./QueryStreamKey";
import type * as QueryStreamKeyValues from "./QueryStreamKeyValues";

const NumberValue = Schema.declare<number>(
  (value): value is number => typeof value === "number",
);

const TypeId = "~@confect/server/QueryStreamIndexPrefix";

/**
 * @experimental
 *
 * @internal
 */
export type IndexEntries = ReadonlyArray<
  readonly [string, QueryStreamKeyValues.QueryStreamKeyValues[number]]
>;

/**
 * Index coordinates retain the field path belonging to each value.
 *
 * @experimental
 *
 * @internal
 */
export interface QueryStreamIndexPrefix {
  readonly [TypeId]: IndexEntries;
}

/**
 * @experimental
 *
 * @internal
 */
export class IndexPrefixWidthMismatchError extends Schema.TaggedError<
  IndexPrefixWidthMismatchError,
  unknown
>()("IndexPrefixWidthMismatchError", {
  width: NumberValue,
  actual: NumberValue,
}) {
  override get message(): string {
    return `Invalid index prefix key width (${this.actual}); expected at most ${this.width}`;
  }
}

/**
 * @experimental
 *
 * @internal
 */
export const make = (
  fieldPaths: ReadonlyArray<string>,
  keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError> =>
  keyValues.length <= fieldPaths.length
    ? Result.succeed({ [TypeId]: Array.zip(fieldPaths, keyValues) })
    : Result.fail(
        IndexPrefixWidthMismatchError.make({
          width: fieldPaths.length,
          actual: keyValues.length,
        }),
      );

/**
 * @experimental
 *
 * @internal
 */
export const entries = (self: QueryStreamIndexPrefix): IndexEntries =>
  self[TypeId];

/**
 * @experimental
 *
 * @internal
 */
export const keyValues = (
  self: QueryStreamIndexPrefix,
): QueryStreamKeyValues.QueryStreamKeyValues =>
  Array.map(entries(self), ([, value]) => value);

/**
 * Restore equality values when crossing into index coordinates.
 *
 * @experimental
 *
 * @internal
 */
export const fromStreamKey = (
  fieldPaths: ReadonlyArray<string>,
  equalityKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
  self: QueryStreamKey.QueryStreamKey,
): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError> =>
  make(fieldPaths, Array.appendAll(equalityKeyValues, self.values));
