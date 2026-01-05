import { GenericId } from "@confect/core";
import { Schema } from "effect";
import { Table } from "../../../src/index";

export const Notes = Table.make(
  "notes",
  Schema.Struct({
    userId: Schema.optional(GenericId.GenericId("users")),
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
  });
