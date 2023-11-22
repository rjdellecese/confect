// TODO
// import { Schema } from "@effect/schema";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// TODO
// import { defineEffectSchema, defineEffectTable } from "../../src/schema";

export default defineSchema({
  notes: defineTable({
    content: v.string(),
  }),
});

// TODO
// defineEffectSchema({
//   notes: defineEffectTable(
//     Schema.struct({
//       content: Schema.string,
//     })
//   ),
// });
