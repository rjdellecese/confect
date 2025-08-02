import {
  defineConfectSchema,
  defineConfectTable,
  GenericId,
} from "@rjdellecese/confect/server";
import { Schema } from "effect";

type Tag = {
  readonly name: string;
  readonly tags: readonly Tag[];
};

const Tag = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.suspend((): Schema.Schema<Tag> => Tag)),
});

export const confectSchema = defineConfectSchema({
  notes: defineConfectTable(
    Schema.Struct({
      userId: Schema.optional(GenericId("users")),
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
  users: defineConfectTable(
    Schema.Struct({
      username: Schema.String,
    }),
  ),
  tags: defineConfectTable(Tag),
});

export default confectSchema.convexSchemaDefinition;
