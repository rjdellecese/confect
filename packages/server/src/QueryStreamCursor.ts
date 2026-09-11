import { convexToJson, jsonToConvex, type Value } from "convex/values";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import * as QueryStreamKeyFields from "./QueryStreamKeyFields";

const UNDEFINED_SENTINEL = { $undefined: true } as const;
const KeyValue = Schema.declare<Value | undefined>(
  (value): value is Value | undefined =>
    value === undefined ||
    Result.isSuccess(Result.try(() => convexToJson(value as Value))),
  {
    toCodecJson: () =>
      Schema.link<Value | undefined>()(Schema.Json, {
        decode: SchemaGetter.transformEffect((value, options) =>
          Effect.try({
            try: () =>
              Result.isSuccess(
                Schema.decodeUnknownResult(
                  Schema.Struct({ $undefined: Schema.Literal(true) }),
                  { onExcessProperty: "error" },
                )(value),
              )
                ? undefined
                : jsonToConvex(value as Parameters<typeof jsonToConvex>[0]),
            catch: () =>
              new SchemaIssue.InvalidValue(
                { message: "Invalid Convex order-key value" },
                value,
                options,
              ),
          }),
        ),
        encode: SchemaGetter.transform((value) =>
          value === undefined ? UNDEFINED_SENTINEL : convexToJson(value),
        ),
      }),
  },
);

export const OrderKey = Schema.Array(KeyValue);

export type OrderKey = typeof OrderKey.Type;

export class QueryStreamCursor extends Schema.Class<QueryStreamCursor>(
  "QueryStreamCursor",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    keyFields: QueryStreamKeyFields.QueryStreamKeyFields,
    orderKey: OrderKey,
  }).check(
    Schema.makeFilter(
      (cursor) => cursor.orderKey.length === cursor.keyFields.length,
      {
        message: "key and fields must have the same length",
      },
    ),
  ),
) {}

export const Json = Schema.fromJsonString(
  Schema.toCodecJson(QueryStreamCursor),
);

export const END_CURSOR = "[]";

export const codecForKeyFields = (
  keyFields: QueryStreamKeyFields.QueryStreamKeyFields,
) =>
  Json.check(
    Schema.makeFilter(
      (cursor) => QueryStreamKeyFields.Equivalence(cursor.keyFields, keyFields),
      { message: "Cursor order-key fields do not match the stream" },
    ),
  ).pipe(
    Schema.decodeTo(OrderKey, {
      decode: SchemaGetter.transform((cursor) => cursor.orderKey),
      encode: SchemaGetter.transformEffect((orderKey) =>
        QueryStreamCursor.makeEffect({ version: 1, keyFields, orderKey }),
      ),
    }),
  );
