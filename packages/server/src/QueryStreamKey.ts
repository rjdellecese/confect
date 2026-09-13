import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import type * as QueryStreamOrderKey from "./QueryStreamOrderKey";

const TypeId = "~@confect/server/QueryStreamKey";
const IndexPrefixTypeId = "~@confect/server/QueryStreamKey/IndexPrefix";

interface Payload {
  readonly layout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly values: QueryStreamOrderKey.QueryStreamOrderKey;
}

// The tag stays inside the opaque payload so changing an outer tag cannot
// promote a prefix to a complete key without parsing it.
type State = Data.TaggedEnum<{
  Complete: Payload;
  Prefix: Payload;
}>;
const State = Data.taggedEnum<State>();

export interface Complete {
  readonly [TypeId]: Data.TaggedEnum.Value<State, "Complete">;
}

export interface Prefix {
  readonly [TypeId]: Data.TaggedEnum.Value<State, "Prefix">;
}

export type QueryStreamKey = Complete | Prefix;

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
    ? Result.succeed({ [TypeId]: State.Complete({ layout, values }) })
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
    ? Result.succeed({ [TypeId]: State.Prefix({ layout, values }) })
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
): QueryStreamOrderKey.QueryStreamOrderKey => self[TypeId].values;
export const layout = (
  self: QueryStreamKey,
): QueryStreamKeyLayout.QueryStreamKeyLayout => self[TypeId].layout;

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
