import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import * as Context from "effect/Context";

/**
 * @internal
 */
export type MutationCtxTag<DataModel extends GenericDataModel> =
  Context.Service<GenericMutationCtx<DataModel>, GenericMutationCtx<DataModel>>;

/**
 * @internal
 */
export const MutationCtx = <
  DataModel extends GenericDataModel,
>(): MutationCtxTag<DataModel> =>
  Context.Service<GenericMutationCtx<DataModel>>("@confect/server/MutationCtx");

/**
 * Native Convex context obtained by yielding the generated `MutationCtx` tag
 * inside a mutation.
 *
 * **When to use**
 *
 * Use with code that expects a Convex mutation context. Its database methods
 * work with encoded documents and native promises rather than Confect's decoded
 * values and Effects.
 *
 * @category Services
 */
export type MutationCtx<DataModel extends GenericDataModel> =
  GenericMutationCtx<DataModel>;
