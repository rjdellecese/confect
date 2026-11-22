import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import * as Context from "effect/Context";

/**
 * @internal
 */
export type QueryCtxTag<DataModel extends GenericDataModel> = Context.Service<
  GenericQueryCtx<DataModel>,
  GenericQueryCtx<DataModel>
>;

/**
 * @internal
 */
export const QueryCtx = <
  DataModel extends GenericDataModel,
>(): QueryCtxTag<DataModel> =>
  Context.Service<GenericQueryCtx<DataModel>>("@confect/server/QueryCtx");

/**
 * Native Convex context obtained by yielding the generated `QueryCtx` tag
 * inside a query.
 *
 * **When to use**
 *
 * Use with code that expects a Convex query context. Database reads expose
 * encoded values rather than Confect's decoded documents.
 *
 * @category Services
 */
export type QueryCtx<DataModel extends GenericDataModel> =
  GenericQueryCtx<DataModel>;
