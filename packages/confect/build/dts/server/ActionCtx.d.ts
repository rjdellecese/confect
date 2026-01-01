import { Context } from "effect";
import { GenericActionCtx, GenericDataModel } from "convex/server";

//#region src/server/ActionCtx.d.ts
declare namespace ActionCtx_d_exports {
  export { ActionCtx };
}
declare const ActionCtx: <DataModel extends GenericDataModel>() => Context.Tag<GenericActionCtx<DataModel>, GenericActionCtx<DataModel>>;
type ActionCtx<DataModel extends GenericDataModel> = ReturnType<typeof ActionCtx<DataModel>>["Identifier"];
//#endregion
export { ActionCtx, ActionCtx_d_exports };
//# sourceMappingURL=ActionCtx.d.ts.map