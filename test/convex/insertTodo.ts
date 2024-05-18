import { Schema } from "@effect/schema";

import { ConvexServer } from "~/src";
import * as schema from "~/test/convex/schema";

export default ConvexServer(schema.effectSchema).mutation({
  args: Schema.Struct({
    content: Schema.String,
    dueDate: Schema.DateFromNumber,
  }),
  handler: ({ db }, { content, dueDate }) =>
    db.insert("todos", { content, dueDate }),
});
