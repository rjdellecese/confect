import { Schema } from "@effect/schema";

import { ConfectFunctions } from "~/src";
import * as schema from "~/test/convex/schema";

export default ConfectFunctions(schema.confectSchema).mutation({
  args: Schema.Struct({
    content: Schema.String,
    dueDate: Schema.DateFromNumber,
  }),
  handler: ({ db }, { content, dueDate }) =>
    db.insert("todos", { content, dueDate }),
});
