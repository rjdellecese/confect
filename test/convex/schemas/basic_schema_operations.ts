import { Schema } from "@effect/schema";

import { defineConfectTable } from "~/src/schema";
import {
	type FullTableName,
	type TableNamesWithoutPrefix,
	make,
} from "~/test/test-context-schema";

export const schema = make("basic_schema_operations", {
	notes: defineConfectTable(
		Schema.Struct({
			text: Schema.String.pipe(Schema.maxLength(100)),
			tag: Schema.optionalWith(Schema.String, { exact: true }),
			author: Schema.optionalWith(
				Schema.Struct({
					role: Schema.Literal("admin", "user"),
					name: Schema.String,
				}),
				{ exact: true },
			),
			embedding: Schema.optionalWith(Schema.Array(Schema.Number), {
				exact: true,
			}),
		}),
	)
		.index("by_text", ["text"])
		.index("by_role", ["author.role"])
		.searchIndex("text", {
			searchField: "text",
			filterFields: ["tag"],
		})
		.vectorIndex("embedding", {
			vectorField: "embedding",
			filterFields: ["author.name", "tag"],
			dimensions: 1536,
		}),
});

export const tableName = schema.tableName;

export type TableName<T extends TableNamesWithoutPrefix<typeof schema>> =
	FullTableName<typeof schema, T>;
