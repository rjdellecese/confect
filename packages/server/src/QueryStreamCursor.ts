import * as Array from "effect/Array";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as QueryStreamKeyLabels from "./QueryStreamKeyLabels";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import * as QueryStreamOrderKey from "./QueryStreamOrderKey";

// Serialized labels are a cursor boundary representation. They include every
// runtime position but do not preserve segment boundaries or implicitness.
const RuntimeLabels = Schema.Array(Schema.String);
const RuntimeLabelsEquivalence = Schema.toEquivalence(RuntimeLabels);
const segmentRuntimeLabels = Match.type<QueryStreamKeyLayout.Segment>().pipe(
  Match.tagsExhaustive({
    WithImplicitId: ({ labels }) =>
      Array.append(QueryStreamKeyLabels.toArray(labels), "_id"),
    Explicit: ({ labels }) => QueryStreamKeyLabels.toArray(labels),
  }),
);

/**
 * @experimental
 */
export class QueryStreamCursor extends Schema.Class<QueryStreamCursor>(
  "QueryStreamCursor",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    keyFields: RuntimeLabels,
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
 * Bind cursor encoding and decoding to a layout. Runtime labels are derived
 * here; the version-1 envelope retains its `keyFields` property.
 *
 * @experimental
 */
export const codecForLayout = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
) => {
  const runtimeLabels = Array.flatMap(
    QueryStreamKeyLayout.segments(layout),
    segmentRuntimeLabels,
  );
  return Json.check(
    Schema.makeFilter(
      (cursor) => RuntimeLabelsEquivalence(cursor.keyFields, runtimeLabels),
      { message: "Cursor order-key fields do not match the stream" },
    ),
  ).pipe(
    Schema.decodeTo(QueryStreamOrderKey.QueryStreamOrderKey, {
      decode: SchemaGetter.transform((cursor) => cursor.orderKey),
      encode: SchemaGetter.transformEffect((orderKey) =>
        QueryStreamCursor.makeEffect({
          version: 1,
          keyFields: runtimeLabels,
          orderKey,
        }),
      ),
    }),
  );
};
