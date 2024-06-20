import { Schema } from "@effect/schema";

import { defineConfectTable } from "~/src/schema";
import { make } from "~/test/test-context-schema";

export const schema = make("basic_schema_operations", {
  notes: defineConfectTable(
    Schema.Struct({
      text: Schema.String,
    })
  ).index("by_text", ["text"]),
});
