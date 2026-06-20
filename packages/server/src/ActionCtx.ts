import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";

export type ActionCtxTag<DataModel extends GenericDataModel> = Context.Tag<
  GenericActionCtx<DataModel>,
  GenericActionCtx<DataModel>
>;

export const ActionCtx = <
  DataModel extends GenericDataModel,
>(): ActionCtxTag<DataModel> =>
  Context.GenericTag<GenericActionCtx<DataModel>>("@confect/server/ActionCtx");

export type ActionCtx<DataModel extends GenericDataModel> =
  GenericActionCtx<DataModel>;
