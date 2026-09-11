import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as QueryStreamKeyFields from "./QueryStreamKeyFields";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";

export class QueryStreamCursor extends Schema.Class<QueryStreamCursor>(
  "QueryStreamCursor",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    keyFields: QueryStreamKeyFields.QueryStreamKeyFields,
    orderKey: QueryStreamOrderKey.QueryStreamOrderKey,
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
    Schema.decodeTo(QueryStreamOrderKey.QueryStreamOrderKey, {
      decode: SchemaGetter.transform((cursor) => cursor.orderKey),
      encode: SchemaGetter.transformEffect((orderKey) =>
        QueryStreamCursor.makeEffect({ version: 1, keyFields, orderKey }),
      ),
    }),
  );
