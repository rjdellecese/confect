import { Schema } from "@effect/schema";

import { mutation } from "~/test/convex/confectFunctions";

export default mutation({
  args: Schema.Struct({ content: Schema.String }),
  handler: ({ db }, { content }) => db.insert("notes", { content }),
});
