import { Effect } from "effect";

import { RowLevelSecurity } from "../src/row-level-security";
import { DataModel, Id } from "./_generated/dataModel";
import { mutation, MutationCtx } from "./_generated/server";

export default mutation({
  // RowLevelSecurity<DataModel>({}).withMutationRLS(
  //   ({ db }): Promise<void> =>
  //     Effect.runPromise(Effect.asUnit(db.insert("users", { name: "John Doe" })))
  // )
  args: {},
  handler: async ({ db }) => db.insert("users", { name: "John Doe" }),
});
