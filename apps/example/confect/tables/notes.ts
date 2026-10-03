import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

export default Table.make(() =>
  Schema.Struct({
    userId: Schema.optional(Id("users")),
    text: Schema.String.check(Schema.isMaxLength(100)),
    tag: Schema.optional(Schema.String),
    author: Schema.optional(
      Schema.Struct({
        role: Schema.Literals(["admin", "user"]),
        name: Schema.String,
      }),
    ),
    embedding: Schema.optional(Schema.Array(Schema.Finite)),
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
