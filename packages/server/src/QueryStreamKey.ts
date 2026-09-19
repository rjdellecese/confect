import * as Data from "effect/Data";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import type * as QueryStreamKeyValues from "./QueryStreamKeyValues";

const TypeId = "~@confect/server/QueryStreamKey";

interface Payload {
  readonly [TypeId]: typeof TypeId;
  readonly layout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly values: QueryStreamKeyValues.QueryStreamKeyValues;
}

export type QueryStreamKey = Data.TaggedEnum<{
  Complete: Payload;
  Prefix: Payload;
}>;
const QueryStreamKey = Data.taggedEnum<QueryStreamKey>();

export type Complete = Data.TaggedEnum.Value<QueryStreamKey, "Complete">;
export type Prefix = Data.TaggedEnum.Value<QueryStreamKey, "Prefix">;

export class KeyWidthMismatchError extends Data.TaggedError(
  "KeyWidthMismatchError",
)<{
  readonly kind: "complete" | "prefix";
  readonly width: number;
  readonly actual: number;
}> {
  override get message(): string {
    return `Invalid ${this.kind} key width (${this.actual}); expected ${this.kind === "complete" ? "exactly" : "at most"} ${this.width}`;
  }
}

export const complete = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  values: QueryStreamKeyValues.QueryStreamKeyValues,
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
  values: QueryStreamKeyValues.QueryStreamKeyValues,
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

// A complete key already satisfies the prefix width guarantee.
export const toPrefix = (self: Complete): Prefix =>
  QueryStreamKey.Prefix({
    [TypeId]: TypeId,
    layout: self.layout,
    values: self.values,
  });

export const values = (
  self: QueryStreamKey,
): QueryStreamKeyValues.QueryStreamKeyValues => self.values;
export const layout = (
  self: QueryStreamKey,
): QueryStreamKeyLayout.QueryStreamKeyLayout => self.layout;

export const isComplete = (value: unknown): value is Complete =>
  Predicate.hasProperty(value, TypeId) && QueryStreamKey.$is("Complete")(value);
