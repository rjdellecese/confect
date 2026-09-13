import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import type * as QueryStreamOrderKey from "./QueryStreamOrderKey";

const TypeId = "~@confect/server/QueryStreamKey";
const IndexPrefixTypeId = "~@confect/server/QueryStreamKey/IndexPrefix";

interface Payload {
  readonly [TypeId]: typeof TypeId;
  readonly layout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly values: QueryStreamOrderKey.QueryStreamOrderKey;
}

export type QueryStreamKey = Data.TaggedEnum<{
  Complete: Payload;
  Prefix: Payload;
}>;
const QueryStreamKey = Data.taggedEnum<QueryStreamKey>();

export type Complete = Data.TaggedEnum.Value<QueryStreamKey, "Complete">;
export type Prefix = Data.TaggedEnum.Value<QueryStreamKey, "Prefix">;

/**
 * Index coordinates retain the path belonging to each value.
 */
export type IndexEntries = ReadonlyArray<
  readonly [string, QueryStreamOrderKey.QueryStreamOrderKey[number]]
>;

export interface IndexPrefix {
  readonly [IndexPrefixTypeId]: IndexEntries;
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
    ? Result.succeed(
        QueryStreamKey.Complete({ [TypeId]: TypeId, layout, values }),
      )
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
    ? Result.succeed(
        QueryStreamKey.Prefix({ [TypeId]: TypeId, layout, values }),
      )
    : Result.fail(
        new KeyWidthMismatchError({
          kind: "prefix",
          width,
          actual: values.length,
        }),
      );
};

export const values = (
  self: QueryStreamKey,
): QueryStreamOrderKey.QueryStreamOrderKey => self.values;
export const layout = (
  self: QueryStreamKey,
): QueryStreamKeyLayout.QueryStreamKeyLayout => self.layout;

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

export const indexEntries = (self: IndexPrefix): IndexEntries =>
  self[IndexPrefixTypeId];

/**
 * Equality values are restored only when crossing into index coordinates.
 */
export const toIndexPrefix = (
  fieldPaths: ReadonlyArray<string>,
  equalities: QueryStreamOrderKey.QueryStreamOrderKey,
  self: QueryStreamKey,
): Result.Result<IndexPrefix, KeyWidthMismatchError> =>
  indexPrefix(fieldPaths, Array.appendAll(equalities, values(self)));
