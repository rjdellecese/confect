import { Schema } from "@effect/schema";

import { confectServer } from "~/src";
import * as schema from "~/test/convex/schema";

export default confectServer(schema.confectSchema).mutation({
  args: Schema.Struct({
    content: Schema.String,
    dueDate: Schema.DateFromNumber,
    assignees: Schema.Array(Schema.NonEmpty).pipe(Schema.maxItems(10)),
  }),
  handler: ({ db }, { content, dueDate, assignees }) =>
    db.insert("todos", { content, dueDate, assignees }),
});
