import { Table } from "@confect/server";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

export default Table.make(() =>
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
  });
