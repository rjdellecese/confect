import { Schema } from "@effect/schema";

import { defineEffectSchema, defineEffectTable } from "~/src/schema";

export const effectSchema = defineEffectSchema({
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

const convexSchema = effectSchema.schemaDefinition;

export default convexSchema;
