import * as Data from "effect/Data";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import type * as QueryStreamKeyValues from "./QueryStreamKeyValues";

const TypeId = "~@confect/server/QueryStreamKey";

interface Payload {
  readonly [TypeId]: typeof TypeId;
  readonly keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
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
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
): Result.Result<Complete, KeyWidthMismatchError> => {
  const width = QueryStreamKeyLayout.runtimeWidth(keyLayout);
  return keyValues.length === width
    ? Result.succeed(
        QueryStreamKey.Complete({ [TypeId]: TypeId, keyLayout, keyValues }),
      )
    : Result.fail(
        new KeyWidthMismatchError({
          kind: "complete",
          width,
          actual: keyValues.length,
        }),
      );
};

export const prefix = (
  keyLayout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
): Result.Result<Prefix, KeyWidthMismatchError> => {
  const width = QueryStreamKeyLayout.runtimeWidth(keyLayout);
  return keyValues.length <= width
    ? Result.succeed(
        QueryStreamKey.Prefix({ [TypeId]: TypeId, keyLayout, keyValues }),
      )
    : Result.fail(
        new KeyWidthMismatchError({
          kind: "prefix",
          width,
          actual: keyValues.length,
        }),
      );
};

// A complete key already satisfies the prefix width guarantee.
export const toPrefix = (self: Complete): Prefix =>
  QueryStreamKey.Prefix({
    [TypeId]: TypeId,
    keyLayout: self.keyLayout,
    keyValues: self.keyValues,
  });

export const keyValues = (
  self: QueryStreamKey,
): QueryStreamKeyValues.QueryStreamKeyValues => self.keyValues;
export const keyLayout = (
  self: QueryStreamKey,
): QueryStreamKeyLayout.QueryStreamKeyLayout => self.keyLayout;

export const isComplete = (value: unknown): value is Complete =>
  Predicate.hasProperty(value, TypeId) && QueryStreamKey.$is("Complete")(value);
