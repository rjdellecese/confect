import type * as IdScope from "@confect/core/IdScope";
import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import * as Context from "effect/Context";
import type * as ComponentCtx from "./ComponentCtx";
import * as Layer from "effect/Layer";

export type MutationCtxTag<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = Context.Service<
  MutationCtx<DataModel, Scope>,
  Scope extends IdScope.App
    ? GenericMutationCtx<DataModel>
    : ComponentCtx.Mutation<DataModel, Scope>
>;

export const MutationCtx = <
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
>(): MutationCtxTag<DataModel, Scope> =>
  Context.Service("@confect/server/MutationCtx");

export type MutationCtx<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = Scope extends IdScope.App
  ? GenericMutationCtx<DataModel>
  : ComponentCtx.Identifier<"mutation", DataModel, Scope>;

export const layer = <
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
>(
  ctx: GenericMutationCtx<DataModel>,
  scope: Scope,
) => {
  const tag = MutationCtx<DataModel, Scope>();
  const { auth: _auth, ...componentCtx } = ctx;
  return Layer.succeed(
    tag,
    (scope === "" ? ctx : componentCtx) as unknown as Context.Service.Shape<
      typeof tag
    >,
  );
};
