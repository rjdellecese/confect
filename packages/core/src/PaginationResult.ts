import * as Schema from "effect/Schema";

export type PaginationResult<Doc extends Schema.Codec<any, any>> = ReturnType<
  typeof PaginationResult<Doc>
>;

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
