import { Schema } from "@effect/schema";

import { defineConfectTable } from "~/src/schema";
import { make } from "~/test/test-context-schema";

export const schema = make("basic_schema_operations", {
  notes: defineConfectTable(
    Schema.Struct({
      text: Schema.String,
      // TODO: Make this work too
      // author: Schema.optional(
      //   Schema.Struct({
      //     role: Schema.Literal("admin", "user"),
      //     name: Schema.String,
      //   })
      // ),
    })
  ).index("by_text", ["text"]),
  // TODO: Make this work
  // .index("by_role", ["author.role"]),
});
