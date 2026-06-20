import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import * as Context from "effect/Context";

export type MutationCtxTag<DataModel extends GenericDataModel> = Context.Tag<
  GenericMutationCtx<DataModel>,
  GenericMutationCtx<DataModel>
>;

export const MutationCtx = <
  DataModel extends GenericDataModel,
>(): MutationCtxTag<DataModel> =>
  Context.GenericTag<GenericMutationCtx<DataModel>>(
    "@confect/server/MutationCtx",
  );

export type MutationCtx<DataModel extends GenericDataModel> =
  GenericMutationCtx<DataModel>;
