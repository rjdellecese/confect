import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import * as Context from "effect/Context";

/**
 * Annotates the generated `QueryCtx` tag. For an Effect requirement, import the
 * type `QueryCtx` from `confect/_generated/services` instead of naming this tag
 * type.
 *
 * @internal
 */
export type QueryCtxTag<DataModel extends GenericDataModel> = Context.Service<
  GenericQueryCtx<DataModel>,
  GenericQueryCtx<DataModel>
>;

/**
 * Constructs the schema-specific tag for generated services. Import `QueryCtx`
 * from `confect/_generated/services` and yield it rather than calling this
 * factory.
 *
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
