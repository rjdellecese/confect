import { Schema } from "@effect/schema";

import { ConfectFunctions } from "~/src";
import * as schema from "~/test/convex/schema";

export default ConfectFunctions(schema.confectSchema).query({
  args: Schema.Struct({}),
  handler: ({ db }) => db.query("notes").withIndex("by_content").collect(),
});
