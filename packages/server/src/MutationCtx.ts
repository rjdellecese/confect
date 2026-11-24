import type * as IdScope from "@confect/core/IdScope";
import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import * as Context from "effect/Context";
import type * as ComponentCtx from "./ComponentCtx";
import * as RequestMetadata from "./RequestMetadata";
import * as Layer from "effect/Layer";

/**
 * Annotates the generated `MutationCtx` tag. For an Effect requirement, import
 * the type `MutationCtx` from `confect/_generated/services` instead of naming
 * this tag type.
 *
 * @internal
 */
export type MutationCtxTag<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = Context.Service<
  MutationCtx<DataModel, Scope>,
  [Scope] extends [IdScope.App]
    ? GenericMutationCtx<DataModel>
    : ComponentCtx.Mutation<DataModel, Scope>
>;

/**
 * Constructs the schema-specific tag for generated services. Import
 * `MutationCtx` from `confect/_generated/services` and yield it rather than
 * calling this factory.
 *
 * @internal
 */
export const MutationCtx = <
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
>(): MutationCtxTag<DataModel, Scope> =>
  Context.Service("@confect/server/MutationCtx");

/**
 * Effect requirement for access to the Convex mutation context. Yield the
 * generated `MutationCtx` tag inside a mutation.
 *
 * **When to use**
 *
 * Use when an integration needs encoded documents and native promises rather
 * than Confect's decoded values and Effects.
 *
 * **Gotchas**
 *
 * In a component, database, storage, and scheduling operations use scoped IDs,
 * `ctx.auth` is absent, and request metadata returns a null `authToken`.
 *
 * @category Services
 */
export type MutationCtx<
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope = IdScope.App,
> = [Scope] extends [IdScope.App]
  ? GenericMutationCtx<DataModel>
  : ComponentCtx.Identifier<"mutation", DataModel, Scope>;

/**
 * Provides the generated `MutationCtx` tag with the invocation's scoped
 * context.
 *
 * @internal
 */
export const layer = <
  DataModel extends GenericDataModel,
  Scope extends IdScope.IdScope,
>(
  ctx: GenericMutationCtx<DataModel>,
  scope: Scope,
) => {
  const tag = MutationCtx<DataModel, Scope>();
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
