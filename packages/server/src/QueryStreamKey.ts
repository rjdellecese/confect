import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import type * as QueryStreamOrderKey from "./QueryStreamOrderKey";

const CompleteTypeId = "~@confect/server/QueryStreamKey/Complete";
const PrefixTypeId = "~@confect/server/QueryStreamKey/Prefix";
const IndexPrefixTypeId = "~@confect/server/QueryStreamKey/IndexPrefix";

export interface Complete {
  readonly [CompleteTypeId]: {
    readonly layout: QueryStreamKeyLayout.QueryStreamKeyLayout;
    readonly values: QueryStreamOrderKey.QueryStreamOrderKey;
  };
}

export interface Prefix {
  readonly [PrefixTypeId]: {
    readonly layout: QueryStreamKeyLayout.QueryStreamKeyLayout;
    readonly values: QueryStreamOrderKey.QueryStreamOrderKey;
  };
}

/**
 * Index coordinates retain the path belonging to each value.
 */
export interface IndexPrefix {
  readonly [IndexPrefixTypeId]: ReadonlyArray<
    readonly [string, QueryStreamOrderKey.QueryStreamOrderKey[number]]
  >;
}

export class KeyWidthMismatchError extends Data.TaggedError(
  "KeyWidthMismatchError",
)<{
  readonly kind: "complete" | "prefix" | "index prefix";
  readonly width: number;
  readonly actual: number;
}> {
  override get message(): string {
    return `Invalid ${this.kind} key width (${this.actual}); expected ${this.kind === "complete" ? "exactly" : "at most"} ${this.width}`;
  }
}

export const complete = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  values: QueryStreamOrderKey.QueryStreamOrderKey,
): Result.Result<Complete, KeyWidthMismatchError> => {
  const width = QueryStreamKeyLayout.runtimeWidth(layout);
  return values.length === width
    ? Result.succeed({ [CompleteTypeId]: { layout, values } })
    : Result.fail(
        new KeyWidthMismatchError({
          kind: "complete",
          width,
          actual: values.length,
        }),
      );
};

export const prefix = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  values: QueryStreamOrderKey.QueryStreamOrderKey,
): Result.Result<Prefix, KeyWidthMismatchError> => {
  const width = QueryStreamKeyLayout.runtimeWidth(layout);
  return values.length <= width
    ? Result.succeed({ [PrefixTypeId]: { layout, values } })
    : Result.fail(
        new KeyWidthMismatchError({
          kind: "prefix",
          width,
          actual: values.length,
        }),
      );
};

export const values = (
  self: Complete,
): QueryStreamOrderKey.QueryStreamOrderKey => self[CompleteTypeId].values;
export const layout = (
  self: Complete,
): QueryStreamKeyLayout.QueryStreamKeyLayout => self[CompleteTypeId].layout;
export const prefixValues = (
  self: Prefix,
): QueryStreamOrderKey.QueryStreamOrderKey => self[PrefixTypeId].values;
export const asPrefix = (self: Complete): Prefix => ({
  [PrefixTypeId]: self[CompleteTypeId],
});

export const indexPrefix = (
  fieldPaths: ReadonlyArray<string>,
  orderKey: QueryStreamOrderKey.QueryStreamOrderKey,
): Result.Result<IndexPrefix, KeyWidthMismatchError> =>
  orderKey.length <= fieldPaths.length
    ? Result.succeed({ [IndexPrefixTypeId]: Array.zip(fieldPaths, orderKey) })
    : Result.fail(
        new KeyWidthMismatchError({
          kind: "index prefix",
          width: fieldPaths.length,
          actual: orderKey.length,
        }),
      );

export const indexEntries = (
  self: IndexPrefix,
): ReadonlyArray<
  readonly [string, QueryStreamOrderKey.QueryStreamOrderKey[number]]
> => self[IndexPrefixTypeId];

/**
 * Equality values are restored only when crossing into index coordinates.
 */
export const toIndexPrefix = (
  fieldPaths: ReadonlyArray<string>,
  equalities: QueryStreamOrderKey.QueryStreamOrderKey,
  self: Prefix,
): Result.Result<IndexPrefix, KeyWidthMismatchError> =>
  indexPrefix(fieldPaths, Array.appendAll(equalities, prefixValues(self)));
