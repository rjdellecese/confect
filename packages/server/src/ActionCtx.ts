import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";

/**
 * @internal
 */
export type ActionCtxTag<DataModel extends GenericDataModel> = Context.Service<
  GenericActionCtx<DataModel>,
  GenericActionCtx<DataModel>
>;

/**
 * @internal
 */
export const ActionCtx = <
  DataModel extends GenericDataModel,
>(): ActionCtxTag<DataModel> =>
  Context.Service<GenericActionCtx<DataModel>>("@confect/server/ActionCtx");

/**
 * Native Convex action context exposed by the generated `ActionCtx` service.
 * Methods retain Convex's encoded-value and Promise contracts.
 */
export type ActionCtx<DataModel extends GenericDataModel> =
  GenericActionCtx<DataModel>;
