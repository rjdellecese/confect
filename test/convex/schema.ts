import { Schema } from "@effect/schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { defineEffectSchema, defineEffectTable } from "../../src/schema";

defineEffectSchema({
  notes: defineEffectTable(
    Schema.struct({
      content: Schema.string,
    })
  ).index("content", ["content"]),
}).schemaDefinition;

// export default schema;

export default defineSchema({
  notes: defineTable({
    content: v.string(),
  }),
});
