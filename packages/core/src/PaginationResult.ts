import * as Schema from "effect/Schema";

/**
 * The codec shape of a paginated result for the item codec `Doc`. Its decoded
 * `page` is a mutable array of decoded items; encoding uses the item codec's
 * Convex representation.
 *
 * `isDone` marks the end of the query, and `continueCursor` resumes the next
 * page. Optional `splitCursor` (a string or null) and `pageStatus`
 * (`"SplitRecommended"`, `"SplitRequired"`, or null) support splitting pages.
 * Paginated function constructors compose this codec from their `item`
 * factory.
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
