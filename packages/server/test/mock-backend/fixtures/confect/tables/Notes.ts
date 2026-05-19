import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const Notes = Table.make(
  "notes",
  Schema.Struct({
    userId: Schema.optionalKey(GenericId.GenericId("users")),
    text: Schema.String.pipe(Schema.check(Schema.isMaxLength(100))),
    tag: Schema.optionalKey(Schema.String),
    author: Schema.optionalKey(
      Schema.Struct({
        role: Schema.Literals(["admin", "user"]),
        name: Schema.String,
      }),
    ),
    embedding: Schema.optionalKey(Schema.Array(Schema.Number)),
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
