import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as QueryStreamKey from "./QueryStreamKey";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as QueryStreamKeyLayout from "./QueryStreamKeyLayout";
import * as QueryStreamKeyValues from "./QueryStreamKeyValues";

// Serialized labels are a cursor boundary representation. They include every
// runtime position but do not preserve implicitness.
const RuntimeLabels = Schema.Array(Schema.String);
const RuntimeLabelsEquivalence = Schema.toEquivalence(RuntimeLabels);
const positionRuntimeLabel = Match.type<QueryStreamKeyLayout.Position>().pipe(
  Match.tagsExhaustive({
    Visible: ({ label }) => label,
    ImplicitId: () => "_id",
  }),
);

/**
 * @experimental
 */
export const QueryStreamCursor = Schema.Struct({
  version: Schema.Literal(1),
  runtimeLabels: RuntimeLabels,
  keyValues: QueryStreamKeyValues.QueryStreamKeyValues,
}).check(
  Schema.makeFilter(
    (cursor) => cursor.keyValues.length === cursor.runtimeLabels.length,
    { message: "key values and runtime labels must have the same length" },
  ),
);

export interface QueryStreamCursor extends Schema.Schema.Type<
  typeof QueryStreamCursor
> {}

/**
 * @experimental
 */
export const Json = Schema.fromJsonString(
  Schema.toCodecJson(
    QueryStreamCursor.pipe(
      Schema.encodeKeys({
        runtimeLabels: "keyFields",
        keyValues: "orderKey",
      }),
    ),
  ),
);

/**
 * @experimental
 */
export const END_CURSOR = "[]";

/**
 * Bind cursor encoding and decoding to a layout. Runtime labels are derived
 * here; the version-1 envelope retains its `keyFields` and `orderKey`
 * properties.
 *
 * @experimental
 */
export const codecForLayout = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
) => {
  const runtimeLabels = Array.map(
    QueryStreamKeyLayout.positions(layout),
    positionRuntimeLabel,
  );
  return Json.check(
    Schema.makeFilter(
      (cursor) => RuntimeLabelsEquivalence(cursor.runtimeLabels, runtimeLabels),
      { message: "Cursor runtime labels do not match the stream" },
    ),
  ).pipe(
    Schema.decodeTo(
      Schema.declare(QueryStreamKey.isComplete).check(
        Schema.makeFilter(
          (key) => QueryStreamKeyLayout.compatible(key.layout, layout),
          { message: "Cursor key does not belong to the stream layout" },
        ),
      ),
      {
        decode: SchemaGetter.transformEffect((cursor, options) =>
          Effect.fromResult(
            QueryStreamKey.complete(layout, cursor.keyValues),
          ).pipe(
            Effect.mapError(
              (error) =>
                new SchemaIssue.InvalidValue(
                  { message: error.message },
                  cursor.keyValues,
                  options,
                ),
            ),
          ),
        ),
        encode: SchemaGetter.transformEffect((key) =>
          QueryStreamCursor.makeEffect({
            version: 1,
            runtimeLabels,
            keyValues: key.values,
          }),
        ),
      },
    ),
  );
};
