import { Schema } from "@effect/schema";

import { defineEffectSchema, defineEffectTable } from "~/src/schema";

export const confectSchema = defineEffectSchema({
  basicSchemaOperations: defineEffectTable(
    Schema.Struct({
      text: Schema.String,
    })
  ),
  notes: defineEffectTable(
    Schema.Struct({
      content: Schema.String,
    })
  ).index("by_content", ["content"]),
  todos: defineEffectTable(
    Schema.Struct({
      content: Schema.String,
      dueDate: Schema.DateFromNumber,
    })
  ).index("by_content", ["content"]),
});

export default confectSchema.schemaDefinition;
