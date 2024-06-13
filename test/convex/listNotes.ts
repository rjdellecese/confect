import { Schema } from "@effect/schema";

import { confectServer } from "~/src";
import * as schema from "~/test/convex/schema";

export default confectServer(schema.confectSchema).query({
  args: Schema.Struct({}),
  handler: ({ db }) => db.query("notes").collect(),
});
