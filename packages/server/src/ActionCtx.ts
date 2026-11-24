import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";

/**
 * Annotates the generated `ActionCtx` tag. For an Effect requirement, import
 * the type `ActionCtx` from `confect/_generated/services` instead of naming
 * this tag type.
 *
 * @internal
 */
export type ActionCtxTag<DataModel extends GenericDataModel> = Context.Service<
  GenericActionCtx<DataModel>,
  GenericActionCtx<DataModel>
>;

/**
 * Constructs the schema-specific tag for generated services. Import `ActionCtx`
 * from `confect/_generated/services` and yield it rather than calling this
 * factory.
 *
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
