import { Schema } from "effect";
import * as schema from "../../src/server/ConfectSchema";
import { GenericId } from "../../src/server/schemas/GenericId";

export const confectSchemaTables = {
  notes: schema
    .defineConfectTable(
      Schema.Struct({
        userId: Schema.optional(GenericId("users")),
        text: Schema.String.pipe(Schema.maxLength(100)),
        tag: Schema.optional(Schema.String),
        author: Schema.optional(
          Schema.Struct({
            role: Schema.Literal("admin", "user"),
            name: Schema.String,
          })
        ),
        embedding: Schema.optional(Schema.Array(Schema.Number)),
        bigDecimal: Schema.optional(Schema.BigDecimal),
      })
    )
    .index("by_text", ["text"])
    .index("by_role", ["author.role"])
    .index("by_name_and_role_and_text", ["author.name", "author.role", "text"])
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
    })
  ),
};

export const confectSchema = schema.defineConfectSchema(confectSchemaTables);

export default confectSchema.convexSchemaDefinition;
