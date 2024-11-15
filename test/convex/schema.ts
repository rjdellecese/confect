import { Schema } from "effect";
import * as schema from "~/src/server/schema";
import { Id } from "~/src/server/schemas/Id";

export const confectSchema = schema.defineSchema({
	notes: schema
		.defineTable(
			Schema.Struct({
				userId: Schema.optional(Id("users")),
				text: Schema.String.pipe(Schema.maxLength(100)),
				tag: Schema.optional(Schema.String),
				author: Schema.optional(
					Schema.Struct({
						role: Schema.Literal("admin", "user"),
						name: Schema.String,
					}),
				),
				embedding: Schema.optional(Schema.Array(Schema.Number)),
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
	users: schema.defineTable(
		Schema.Struct({
			username: Schema.String,
		}),
	),
});

export default confectSchema.convexSchemaDefinition;
