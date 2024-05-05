import { Schema } from "@effect/schema";

import { ConvexServer } from "~/src";
import * as schema from "~/test/convex/schema";

export default ConvexServer(schema.effectSchema).mutation({
  args: Schema.struct({ content: Schema.string }),
  handler: ({ db }, { content }) => db.insert("notes", { content }),
});
