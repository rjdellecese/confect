import { Schema } from "@effect/schema";

import { ConvexServer } from "../src";
import * as schema from "../test/convex/schema";

export default ConvexServer(schema.effectSchema).query({
  args: Schema.struct({}),
  handler: ({ db }) => db.query("notes").withIndex("by_content").collect(),
});
