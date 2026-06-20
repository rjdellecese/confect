import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import * as Context from "effect/Context";

export type QueryCtxTag<DataModel extends GenericDataModel> = Context.Tag<
  GenericQueryCtx<DataModel>,
  GenericQueryCtx<DataModel>
>;

export const QueryCtx = <
  DataModel extends GenericDataModel,
>(): QueryCtxTag<DataModel> =>
  Context.GenericTag<GenericQueryCtx<DataModel>>("@confect/server/QueryCtx");

export type QueryCtx<DataModel extends GenericDataModel> =
  GenericQueryCtx<DataModel>;
