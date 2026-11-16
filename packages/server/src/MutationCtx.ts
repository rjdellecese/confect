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
 * Native Convex mutation context exposed by the generated `MutationCtx`
 * service. Use Confect services instead when decoded schemas and Effect results
 * are needed.
 *
 * @category Services
 */
export type MutationCtx<DataModel extends GenericDataModel> =
  GenericMutationCtx<DataModel>;
