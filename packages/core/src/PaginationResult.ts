import * as Schema from "effect/Schema";

/**
 * The result codec type that paginated function declarations derive from their
 * `item` codec. Its `page` is a mutable array of decoded items; encoding the
 * page uses each item's Convex representation.
 *
 * **Details**
 *
 * `isDone` marks the last page; otherwise, pass `continueCursor` to resume the
 * query. The optional `splitCursor` (a string or null) and `pageStatus`
 * (`"SplitRecommended"`, `"SplitRequired"`, or null) describe how the page may
 * be split.
 *
 * @category Schemas
 */
export type PaginationResult<Doc extends Schema.Codec<any, any>> = ReturnType<
  typeof PaginationResult<Doc>
>;

/**
 * @internal
 */
export const PaginationResult = <Doc extends Schema.Codec<any, any>>(
  Doc: Doc,
) =>
  Schema.Struct({
    page: Doc.pipe(Schema.Array, Schema.mutable),
    isDone: Schema.Boolean,
    continueCursor: Schema.String,
    splitCursor: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    pageStatus: Schema.optionalKey(
      Schema.Union([
        Schema.Literal("SplitRecommended"),
        Schema.Literal("SplitRequired"),
        Schema.Null,
      ]),
    ),
  });
