import { Context } from "effect";
import { GenericDataModel, GenericQueryCtx } from "convex/server";

//#region src/server/QueryCtx.d.ts
declare namespace QueryCtx_d_exports {
  export { QueryCtx };
}
declare const QueryCtx: <DataModel extends GenericDataModel>() => Context.Tag<GenericQueryCtx<DataModel>, GenericQueryCtx<DataModel>>;
type QueryCtx<DataModel extends GenericDataModel> = ReturnType<typeof QueryCtx<DataModel>>["Identifier"];
//#endregion
export { QueryCtx, QueryCtx_d_exports };
//# sourceMappingURL=QueryCtx.d.ts.map