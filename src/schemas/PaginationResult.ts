import { Schema } from "@effect/schema";

export const PaginationResult = <Doc extends Schema.Schema.AnyNoContext>(
	Doc: Doc,
) =>
	Schema.Struct({
		page: Schema.Array(Doc).pipe(Schema.mutable),
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
	}).pipe(Schema.mutable);
