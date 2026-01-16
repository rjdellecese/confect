import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const Notes = Table.make(
  "notes",
  Schema.Struct({
    userId: Schema.optional(GenericId.GenericId("users")),
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
  });
