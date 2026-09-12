import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as QueryStreamKeyFields from "./QueryStreamKeyFields";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";

/**
 * @experimental
 */
export class QueryStreamCursor extends Schema.Class<QueryStreamCursor>(
  "QueryStreamCursor",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    keyFields: QueryStreamKeyFields.Names,
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

/**
 * @experimental
 */
export const Json = Schema.fromJsonString(
  Schema.toCodecJson(QueryStreamCursor),
);

/**
 * @experimental
 */
export const END_CURSOR = "[]";

/**
 * @experimental
 */
export const codecForKeyFields = (keyFields: QueryStreamKeyFields.Names) =>
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
