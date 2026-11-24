import type * as IdScope from "@confect/core/IdScope";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import * as Context from "effect/Context";
import type * as ComponentCtx from "./ComponentCtx";
import * as RequestMetadata from "./RequestMetadata";
import * as Layer from "effect/Layer";

/**
 * Annotates the generated `ActionCtx` tag. For an Effect requirement, import
 * the type `ActionCtx` from `confect/_generated/services` instead of naming
 * this tag type.
 *
 * @internal
 */
export type ActionCtxTag<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = Context.Service<
  ActionCtx<DataModel, Scope>,
  [Scope] extends [IdScope.App]
    ? GenericActionCtx<DataModel>
    : ComponentCtx.Action<DataModel, Scope>
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
  Scope extends IdScope.IdScope = IdScope.App,
>(): ActionCtxTag<DataModel, Scope> =>
  Context.Service("@confect/server/ActionCtx");

/**
 * Effect requirement for access to the Convex action context. Yield the
 * generated `ActionCtx` tag in an action or an HTTP route built with
 * `HttpRouter.forSchema`.
 *
 * **When to use**
 *
 * Use when an integration expects encoded arguments and native promises rather
 * than Confect Effects.
 *
 * **Gotchas**
 *
 * In a component, storage, scheduling, and vector search use scoped IDs,
 * `ctx.auth` is absent, and request metadata returns a null `authToken`.
 *
 * @category Services
 */
export type ActionCtx<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = [Scope] extends [IdScope.App]
  ? GenericActionCtx<DataModel>
  : ComponentCtx.Identifier<"action", DataModel, Scope>;

/**
 * Provides the generated `ActionCtx` tag with the invocation's scoped context.
 *
 * @internal
 */
export const layer = <
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
>(
  ctx: GenericActionCtx<DataModel>,
  scope: Scope,
) => {
  const tag = ActionCtx<DataModel, Scope>();
  const { auth: _auth, ...componentCtx } = ctx;
  return Layer.succeed(
    tag,
    (scope === ""
      ? ctx
      : {
          ...componentCtx,
          meta: RequestMetadata.forScope(ctx.meta, scope),
        }) as unknown as Context.Service.Shape<typeof tag>,
  );
};
