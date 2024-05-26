import { Schema } from "@effect/schema";

import { mutation } from "~/test/convex/confectFunctions";

export const insert = mutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  handler: (ctx, { text }) => {
    return ctx.db.insert("basicSchemaOperations", { text });
  },
});
