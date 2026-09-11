import {
  ConvexError,
  convexToJson,
  jsonToConvex,
  type Value,
} from "convex/values";
import * as Array from "effect/Array";
import * as Equivalence from "effect/Equivalence";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export type OrderKey = ReadonlyArray<Value | undefined>;

const UNDEFINED_SENTINEL = { $undefined: true } as const;
const decodeUndefinedSentinel = Schema.decodeUnknownResult(
  Schema.Struct({ $undefined: Schema.Literal(true) }),
  { onExcessProperty: "error" },
);
const decodeKeyValue = (value: Schema.Json): Value | undefined =>
  Result.isSuccess(decodeUndefinedSentinel(value))
    ? undefined
    : jsonToConvex(value as Parameters<typeof jsonToConvex>[0]);

const KeyValue = Schema.Json.check(
  Schema.makeFilter(
    (value) => Result.isSuccess(Result.try(() => decodeKeyValue(value))),
    { message: "Invalid Convex order-key value" },
  ),
);

export const QueryStreamCursor = Schema.Struct({
  version: Schema.Literal(1),
  keyFields: Schema.Array(Schema.String),
  key: Schema.Array(KeyValue),
}).check(
  Schema.makeFilter((cursor) => cursor.key.length === cursor.keyFields.length, {
    message: "key and fields must have the same length",
  }),
);

export interface QueryStreamCursor extends Schema.Schema.Type<
  typeof QueryStreamCursor
> {}

export const Json = Schema.fromJsonString(QueryStreamCursor);

export const END_CURSOR = "[]";

const keyFieldsEquivalence = Array.makeEquivalence(Equivalence.String);
const decode = Schema.decodeResult(Json);
const encode = Schema.encodeSync(Json);

const invalidCursorError = () =>
  new ConvexError({ paginationError: "InvalidCursor" });

export const serialize = (
  key: OrderKey,
  keyFields: ReadonlyArray<string>,
): string =>
  encode({
    version: 1,
    keyFields,
    key: Array.map(key, (value) =>
      value === undefined ? UNDEFINED_SENTINEL : convexToJson(value),
    ),
  });

export const deserialize = (
  cursor: string,
  keyFields?: ReadonlyArray<string>,
): OrderKey => {
  const decoded = decode(cursor);
  if (
    Result.isFailure(decoded) ||
    (keyFields !== undefined &&
      !keyFieldsEquivalence(decoded.success.keyFields, keyFields))
  ) {
    throw invalidCursorError();
  }
  return Array.map(decoded.success.key, decodeKeyValue);
};
