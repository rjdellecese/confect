import { Schema } from "@effect/schema";
import { Id, defineSchema, defineTable } from "@rjdellecese/confect/server";

export const confectSchema = defineSchema({
	notes: defineTable(
		Schema.Struct({
			userId: Schema.optionalWith(Id.Id("users"), {
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
	users: defineTable(
		Schema.Struct({
			username: Schema.String,
		}),
	),
});

export default confectSchema.convexSchemaDefinition;
