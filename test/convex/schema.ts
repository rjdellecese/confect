import { Schema } from "@effect/schema";

import { defineEffectSchema, defineEffectTable } from "../../src/schema";

export default defineEffectSchema({
  notes: defineEffectTable(
    Schema.struct({
      content: Schema.string,
    })
  ),
}).schemaDefinition;
