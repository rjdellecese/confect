import * as Schema from "effect/Schema";
import { dual } from "effect/Function";
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
export class IndexPrefixWidthMismatchError extends Schema.TaggedError<
  IndexPrefixWidthMismatchError,
  {}
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
 */
export const make: {
  (
    keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
  ): (
    fieldPaths: ReadonlyArray<string>,
  ) => Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError>;
  (
    fieldPaths: ReadonlyArray<string>,
    keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
  ): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError>;
} = dual(
  2,
  (
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
        ),
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
export const fromStreamKey: {
  (
    equalityKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
    self: QueryStreamKey.QueryStreamKey,
  ): (
    fieldPaths: ReadonlyArray<string>,
  ) => Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError>;
  (
    fieldPaths: ReadonlyArray<string>,
    equalityKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
    self: QueryStreamKey.QueryStreamKey,
  ): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError>;
} = dual(
  3,
  (
    fieldPaths: ReadonlyArray<string>,
    equalityKeyValues: QueryStreamKeyValues.QueryStreamKeyValues,
    self: QueryStreamKey.QueryStreamKey,
  ): Result.Result<QueryStreamIndexPrefix, IndexPrefixWidthMismatchError> =>
    make(fieldPaths, Array.appendAll(equalityKeyValues, self.values)),
);
