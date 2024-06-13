import { Schema } from "@effect/schema";

import { defineConfectSchema, defineConfectTable } from "~/src/schema";

export const confectSchema = defineConfectSchema({
  basicSchemaOperations: defineConfectTable(
    Schema.Struct({
      text: Schema.String,
    })
  ),
  notes: defineConfectTable(
    Schema.Struct({
      content: Schema.String,
    })
  ).index("by_content", ["content"]),
  todos: defineConfectTable(
    Schema.Struct({
      content: Schema.NonEmpty,
      dueDate: Schema.DateFromNumber,
      assignees: Schema.Array(Schema.NonEmpty).pipe(Schema.maxItems(10)),
    })
  ).index("by_content", ["content"]),
});

export default confectSchema.schemaDefinition;
