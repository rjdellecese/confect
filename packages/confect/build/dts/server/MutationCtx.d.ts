import { Context } from "effect";
import { GenericDataModel, GenericMutationCtx } from "convex/server";

//#region src/server/MutationCtx.d.ts
declare namespace MutationCtx_d_exports {
  export { MutationCtx };
}
declare const MutationCtx: <DataModel extends GenericDataModel>() => Context.Tag<GenericMutationCtx<DataModel>, GenericMutationCtx<DataModel>>;
type MutationCtx<DataModel extends GenericDataModel> = ReturnType<typeof MutationCtx<DataModel>>["Identifier"];
//#endregion
export { MutationCtx, MutationCtx_d_exports };
//# sourceMappingURL=MutationCtx.d.ts.map