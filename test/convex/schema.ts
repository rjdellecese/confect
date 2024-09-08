import { Schema } from "@effect/schema";
import * as confect from "~/src/index";

export const confectSchema = confect.schema.defineSchema({
	notes: confect.schema
		.defineTable(
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

export const confectTableSchemas = confect.schema.tableSchemas(
	confectSchema.confectSchema,
);

export default confectSchema.schemaDefinition;
