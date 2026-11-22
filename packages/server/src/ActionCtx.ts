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
 * Native Convex context obtained by yielding the generated `ActionCtx` tag
 * inside an action.
 *
 * **When to use**
 *
 * Use with code that expects a Convex action context. Its methods take encoded
 * arguments and return native values or promises rather than Confect Effects.
 *
 * @category Services
 */
export type ActionCtx<DataModel extends GenericDataModel> =
  GenericActionCtx<DataModel>;
