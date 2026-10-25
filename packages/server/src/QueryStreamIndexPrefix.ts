import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Result from "effect/Result";
import type * as QueryStreamKey from "./QueryStreamKey";
import type * as QueryStreamKeyValues from "./QueryStreamKeyValues";

const TypeId = "~@confect/server/QueryStreamIndexPrefix";

/**
 * @experimental
 */
export type IndexEntries = ReadonlyArray<
  readonly [string, QueryStreamKeyValues.QueryStreamKeyValues[number]]
>;

/**
 * Index coordinates retain the field path belonging to each value.
 *
 * @experimental
 */
export interface QueryStreamIndexPrefix {
  readonly [TypeId]: IndexEntries;
}

/**
 * @experimental
 */
export class IndexPrefixWidthMismatchError extends Data.TaggedError(
  "IndexPrefixWidthMismatchError",
)<{
  readonly width: number;
  readonly actual: number;
}> {
  override get message(): string {
    return `Invalid index prefix key width (${this.actual}); expected at most ${this.width}`;
  }
}

/**
 * @experimental
 */
export const make = (
  fieldPaths: ReadonlyArray<string>,
  keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError> =>
  keyValues.length <= fieldPaths.length
    ? Result.succeed({ [TypeId]: Array.zip(fieldPaths, keyValues) })
    : Result.fail(
        new IndexPrefixWidthMismatchError({
          width: fieldPaths.length,
          actual: keyValues.length,
        }),
      );

/**
 * @experimental
 */
export const entries = (self: QueryStreamIndexPrefix): IndexEntries =>
  self[TypeId];

/**
 * @experimental
 */
export const keyValues = (
  self: QueryStreamIndexPrefix,
): QueryStreamKeyValues.QueryStreamKeyValues =>
  Array.map(entries(self), ([, value]) => value);

/**
 * Restore equality values when crossing into index coordinates.
 *
 * @experimental
 */
export const fromStreamKey = (
  fieldPaths: ReadonlyArray<string>,
  equalityKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
  self: QueryStreamKey.QueryStreamKey,
): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError> =>
  make(fieldPaths, Array.appendAll(equalityKeyValues, self.values));
