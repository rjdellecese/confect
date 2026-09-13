import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as QueryStreamKey from "./QueryStreamKey";
import * as SchemaIssue from "effect/SchemaIssue";
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
export const QueryStreamCursor = Schema.Struct({
  version: Schema.Literal(1),
  keyFields: RuntimeLabels,
  orderKey: QueryStreamOrderKey.QueryStreamOrderKey,
}).check(
  Schema.makeFilter(
    (cursor) => cursor.orderKey.length === cursor.keyFields.length,
    { message: "key and fields must have the same length" },
  ),
);

export interface QueryStreamCursor extends Schema.Schema.Type<
  typeof QueryStreamCursor
> {}

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
    Schema.decodeTo(
      Schema.declare(QueryStreamKey.isComplete).check(
        Schema.makeFilter(
          (orderKey) =>
            QueryStreamKeyLayout.compatible(orderKey.layout, layout),
          { message: "Cursor key does not belong to the stream layout" },
        ),
      ),
      {
        decode: SchemaGetter.transformEffect((cursor, options) =>
          Effect.fromResult(
            QueryStreamKey.complete(layout, cursor.orderKey),
          ).pipe(
            Effect.mapError(
              (error) =>
                new SchemaIssue.InvalidValue(
                  { message: error.message },
                  cursor.orderKey,
                  options,
                ),
            ),
          ),
        ),
        encode: SchemaGetter.transformEffect((orderKey) =>
          QueryStreamCursor.makeEffect({
            version: 1,
            keyFields: runtimeLabels,
            orderKey: orderKey.values,
          }),
        ),
      },
    ),
  );
};
