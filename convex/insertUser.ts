import { RowLevelSecurity } from "../src/row-level-security";
import { DataModel } from "./_generated/dataModel";
import { mutation, MutationCtx } from "./_generated/server";

export default mutation(
  RowLevelSecurity<MutationCtx, DataModel>({}).withMutationRLS(({ db }) =>
    db.insert("users", { name: "John Doe" })
  )
);
