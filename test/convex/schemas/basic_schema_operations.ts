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
			text: Schema.String,
			author: Schema.optional(
				Schema.Struct({
					role: Schema.Literal("admin", "user"),
					name: Schema.String,
				}),
				{ exact: true },
			),
		}),
	)
		.index("by_text", ["text"])
		.index("by_role", ["author.role"]),
});

export const tableName = schema.tableName;

export type TableName<T extends TableNamesWithoutPrefix<typeof schema>> =
	FullTableName<typeof schema, T>;
