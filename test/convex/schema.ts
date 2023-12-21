import { Schema } from "@effect/schema";

import { defineEffectSchema, defineEffectTable } from "../../src/schema";

const effectSchema = defineEffectSchema({
  notes: defineEffectTable(
    Schema.struct({
      content: Schema.string,
    })
  ),
});

const convexSchema = effectSchema.schemaDefinition;

export default convexSchema;
