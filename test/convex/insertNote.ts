import { Schema } from "@effect/schema";

import { ConvexServer } from "~/src";
import * as schema from "~/test/convex/schema";

export default ConvexServer(schema.effectSchema).mutation({
  args: Schema.Struct({ content: Schema.String }),
  handler: ({ db }, { content }) => db.insert("notes", { content }),
});
