import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import * as Context from "effect/Context";
import type * as ComponentCtx from "./ComponentCtx";
import * as Layer from "effect/Layer";

export type QueryCtxTag<
  DataModel extends GenericDataModel,
  Scope extends string = "",
> = Context.Service<
  QueryCtx<DataModel, Scope>,
  Scope extends ""
    ? GenericQueryCtx<DataModel>
    : ComponentCtx.Query<DataModel, Scope>
>;

export const QueryCtx = <
  DataModel extends GenericDataModel,
  Scope extends string = "",
>(): QueryCtxTag<DataModel, Scope> =>
  Context.Service("@confect/server/QueryCtx");

export type QueryCtx<
  DataModel extends GenericDataModel,
  Scope extends string = "",
> = Scope extends ""
  ? GenericQueryCtx<DataModel>
  : ComponentCtx.Identifier<"query", DataModel, Scope>;

export const layer = <DataModel extends GenericDataModel, Scope extends string>(
  ctx: GenericQueryCtx<DataModel>,
  scope: Scope,
) => {
  const tag = QueryCtx<DataModel, Scope>();
  const { auth: _auth, ...componentCtx } = ctx;
  return Layer.succeed(
    tag,
    (scope === "" ? ctx : componentCtx) as unknown as Context.Service.Shape<
      typeof tag
    >,
  );
};
