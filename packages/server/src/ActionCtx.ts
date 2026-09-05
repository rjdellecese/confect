import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";
import type * as ComponentCtx from "./ComponentCtx";
import * as Layer from "effect/Layer";

export type ActionCtxTag<
  DataModel extends GenericDataModel,
  Scope extends string = "",
> = Context.Service<
  ActionCtx<DataModel, Scope>,
  Scope extends ""
    ? GenericActionCtx<DataModel>
    : ComponentCtx.Action<DataModel, Scope>
>;

export const ActionCtx = <
  DataModel extends GenericDataModel,
  Scope extends string = "",
>(): ActionCtxTag<DataModel, Scope> =>
  Context.Service("@confect/server/ActionCtx");

export type ActionCtx<
  DataModel extends GenericDataModel,
  Scope extends string = "",
> = Scope extends ""
  ? GenericActionCtx<DataModel>
  : ComponentCtx.Identifier<"action", DataModel, Scope>;

export const layer = <DataModel extends GenericDataModel, Scope extends string>(
  ctx: GenericActionCtx<DataModel>,
  scope: Scope,
) => {
  const tag = ActionCtx<DataModel, Scope>();
  const { auth: _auth, ...componentCtx } = ctx;
  return Layer.succeed(
    tag,
    (scope === "" ? ctx : componentCtx) as unknown as Context.Service.Shape<
      typeof tag
    >,
  );
};
