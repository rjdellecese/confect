import * as Schema from "effect/Schema";
import * as Data from "effect/Data";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import type * as QueryStreamKeyValues from "./QueryStreamKeyValues";

const NumberValue = Schema.declare<number>(
  (value): value is number => typeof value === "number",
);

const TypeId = "~@confect/server/QueryStreamKey";

interface Payload {
  readonly [TypeId]: typeof TypeId;
  readonly layout: QueryStreamKeyLayout.QueryStreamKeyLayout;
  readonly values: QueryStreamKeyValues.QueryStreamKeyValues;
}

/**
 * @experimental
 *
 * @internal
 */
export type QueryStreamKey = Data.TaggedEnum<{
  Complete: Payload;
  Prefix: Payload;
}>;
const QueryStreamKey = Data.taggedEnum<QueryStreamKey>();

/**
 * @experimental
 *
 * @internal
 */
export type Complete = Data.TaggedEnum.Value<QueryStreamKey, "Complete">;
/**
 * @experimental
 *
 * @internal
 */
export type Prefix = Data.TaggedEnum.Value<QueryStreamKey, "Prefix">;

/**
 * @experimental
 *
 * @internal
 */
export class KeyWidthMismatchError extends Schema.TaggedError<
  KeyWidthMismatchError,
  {}
>()("KeyWidthMismatchError", {
  kind: Schema.Literals(["complete", "prefix"]),
  width: NumberValue,
  actual: NumberValue,
}) {
  override get message(): string {
    return `Invalid ${this.kind} key width (${this.actual}); expected ${this.kind === "complete" ? "exactly" : "at most"} ${this.width}`;
  }
}

/**
 * @experimental
 *
 * @internal
 */
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
        KeyWidthMismatchError.make({
          kind: "complete",
          width,
          actual: values.length,
        }),
      );
};

/**
 * @experimental
 *
 * @internal
 */
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
        KeyWidthMismatchError.make({
          kind: "prefix",
          width,
          actual: values.length,
        }),
      );
};

// A complete key already satisfies the prefix width guarantee.
/**
 * @experimental
 *
 * @internal
 */
export const toPrefix = (self: Complete): Prefix =>
  QueryStreamKey.Prefix({
    [TypeId]: TypeId,
    layout: self.layout,
    values: self.values,
  });

/**
 * @experimental
 *
 * @internal
 */
export const values = (
  self: QueryStreamKey,
): QueryStreamKeyValues.QueryStreamKeyValues => self.values;
/**
 * @experimental
 *
 * @internal
 */
export const layout = (
  self: QueryStreamKey,
): QueryStreamKeyLayout.QueryStreamKeyLayout => self.layout;

/**
 * @experimental
 *
 * @internal
 */
export const isComplete = (value: unknown): value is Complete =>
  Predicate.hasProperty(value, TypeId) && QueryStreamKey.$is("Complete")(value);
