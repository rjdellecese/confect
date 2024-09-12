import { Schema } from "@effect/schema";
import * as schema from "~/src/schema";
import * as schemas from "~/src/schemas";

export const confectSchema = schema.defineConfectSchema({
	notes: schema
		.defineConfectTable(
			Schema.Struct({
				userId: Schema.optionalWith(schemas.Id.Id<"users">(), {
					exact: true,
				}),
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
	users: schema.defineConfectTable(
		Schema.Struct({
			username: Schema.String,
		}),
	),
});

export const confectTableSchemas = schema.tableSchemas(
	confectSchema.confectSchema,
);

export default confectSchema.schemaDefinition;
