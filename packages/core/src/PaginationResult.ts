import { Schema } from "effect";

export const PaginationOptions = Schema.Struct({
  numItems: Schema.Number,
  cursor: Schema.NullOr(Schema.String),
  endCursor: Schema.optionalWith(Schema.NullOr(Schema.String), {
    exact: true,
  }),
  id: Schema.optionalWith(Schema.Number, { exact: true }),
  maximumRowsRead: Schema.optionalWith(Schema.Number, { exact: true }),
  maximumBytesRead: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const PaginationResult = <Doc extends Schema.Schema.AnyNoContext>(
  Doc: Doc,
) =>
  Schema.Struct({
    page: Schema.mutable(Schema.Array(Doc)),
    isDone: Schema.Boolean,
    continueCursor: Schema.String,
    splitCursor: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), {
      exact: true,
    }),
    pageStatus: Schema.optionalWith(
      Schema.Union(
        Schema.Literal("SplitRecommended"),
        Schema.Literal("SplitRequired"),
        Schema.Null,
      ),
      { exact: true },
    ),
  });
