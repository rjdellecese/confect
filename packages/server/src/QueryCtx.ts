import type * as IdScope from "@confect/core/IdScope";
import type { GenericDataModel, GenericQueryCtx } from "convex/server";
import * as Context from "effect/Context";
import type * as ComponentCtx from "./ComponentCtx";
import * as Layer from "effect/Layer";

/**
 * Annotates the generated `QueryCtx` tag. For an Effect requirement, import the
 * type `QueryCtx` from `confect/_generated/services` instead of naming this tag
 * type.
 *
 * @internal
 */
export type QueryCtxTag<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = Context.Service<
  QueryCtx<DataModel, Scope>,
  [Scope] extends [IdScope.App]
    ? GenericQueryCtx<DataModel>
    : ComponentCtx.Query<DataModel, Scope>
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
  Scope extends IdScope.IdScope = IdScope.App,
>(): QueryCtxTag<DataModel, Scope> =>
  Context.Service("@confect/server/QueryCtx");

/**
 * Effect requirement for access to the Convex query context. Yield the
 * generated `QueryCtx` tag inside a query.
 *
 * **When to use**
 *
 * Use when an integration reads encoded values rather than Confect's decoded
 * documents.
 *
 * **Gotchas**
 *
 * In a component, database and storage operations use scoped IDs and `ctx.auth`
 * is absent.
 *
 * @category Services
 */
export type QueryCtx<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = [Scope] extends [IdScope.App]
  ? GenericQueryCtx<DataModel>
  : ComponentCtx.Identifier<"query", DataModel, Scope>;

/**
 * Provides the generated `QueryCtx` tag with the invocation's scoped context.
 *
 * @internal
 */
export const layer = <
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
>(
  ctx: GenericQueryCtx<DataModel>,
  scope: Scope,
) => {
  const tag = QueryCtx<DataModel, Scope>();
  const { auth: _auth, ...componentCtx } = ctx;
  return Layer.succeed(
    tag,
    (scope === "" ? ctx : componentCtx) as unknown as Context.Service.Shape<
      typeof tag
    >,
  );
};
