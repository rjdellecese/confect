import * as Schema from "effect/Schema";

export const PaginationResult = <Doc extends Schema.Codec<any, any>>(
  Doc: Doc,
) =>
  Schema.Struct({
    page: Schema.mutable(Schema.Array(Doc)),
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
