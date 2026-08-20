import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as MiddlewareKey from "@confect/core/MiddlewareKey";
import * as Registry from "./Registry";
import type * as RegistryItems from "./RegistryItems";
import type * as Spec from "@confect/core/Spec";
import type { Layer, Types } from "effect";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Ref from "effect/Ref";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as GroupImpl from "./GroupImpl";
import { mapLeaves } from "./internal/utils";
import type * as RegisteredFunction from "./RegisteredFunction";
import * as FunctionRegistryItem from "./FunctionRegistryItem";
import * as MiddlewareRegistryItem from "./MiddlewareRegistryItem";
import type * as ResolvedMiddleware from "./ResolvedMiddleware";

export type RegisteredFunctions<Spec_ extends Spec.AnyWithProps> =
  Types.Simplify<RegisteredFunctionsHelper<Spec.Groups<Spec_>>>;

type RegisteredFunctionsHelper<Groups extends GroupSpec.AnyWithProps> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? RegisteredFunctionsForGroupSpec<Group>
    : never;
};

/** The `RegisteredFunction` record for a group's own declared functions. */
type RegisteredFunctionsOf<Group extends GroupSpec.AnyWithProps> = {
  [
    FunctionName in FunctionSpec.Name<GroupSpec.Functions<Group>>
  ]: FunctionSpec.WithName<
    GroupSpec.Functions<Group>,
    FunctionName
  > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
    ? RegisteredFunction.RegisteredFunction<FunctionSpec_>
    : never;
};

/**
 * The registered-functions record for a single group, derived from the group's
 * own `GroupSpec`: its declared functions, plus any nested subgroups it carries
 * directly. This is the node that `buildForGroup` returns — computed from the
 * leaf `GroupSpec` itself rather than by navigating the project-wide assembled
 * `Spec` to a dot-path, so the per-group registry's type depends only on its
 * own leaf. For the filesystem layout a leaf `GroupSpec` carries no subgroups
 * (subdirectory children are assembled separately into `_generated/spec.ts`),
 * so this resolves to just the leaf's functions.
 */
export type RegisteredFunctionsForGroupSpec<
  Group extends GroupSpec.AnyWithProps,
> =
  GroupSpec.Groups<Group> extends infer SubGroups extends GroupSpec.AnyWithProps
    ? Types.Simplify<
        RegisteredFunctionsHelper<SubGroups> & RegisteredFunctionsOf<Group>
      >
    : RegisteredFunctionsOf<Group>;

export interface AnyWithProps {
  readonly [key: string]: RegisteredFunction.Any | AnyWithProps;
}

/**
 * Build the registered Convex functions for a single group from its finalized
 * `GroupImpl` layer.
 *
 * The `groupLayer` parameter requires `GroupImpl<"Finalized">`, so impls that
 * were never piped through `GroupImpl.finalize` (and impls with unmet
 * `FunctionImpl` requirements, which cannot be finalized) are rejected at the
 * codegen boundary, not just deep inside Convex at runtime.
 *
 * The group layer is built with a fresh, isolated `Registry` (rather than the
 * globally-cached default `Context.Reference`), so each `FunctionImpl.make`
 * registers under its flat, single-segment function-name key without colliding
 * with any other group built in the same process — the built registry holds
 * exactly this group's functions at the top level.
 *
 * Only the runtime `databaseSchema` value is needed at runtime (it is forwarded
 * to `makeRegisteredFunction` to build each function's ctx services); the
 * group's `GroupSpec` is supplied purely as the `Group` type parameter to shape
 * the returned record. The generated caller passes it explicitly and imports
 * the leaf spec type-only (`typeof import("…/<group>.spec")["default"]`), so a
 * function's bundle never imports a spec module at runtime.
 */
export const buildForGroup = <Group extends GroupSpec.AnyWithProps>(
  databaseSchema: DatabaseSchema.AnyWithProps,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
  makeRegisteredFunction: (
    databaseSchema: DatabaseSchema.AnyWithProps,
    registryItem: FunctionRegistryItem.ConfectFunctionRegistryItem,
    resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>,
  ) => RegisteredFunction.Any,
): RegisteredFunctionsForGroupSpec<Group> => {
  const registryItems = Effect.gen(function* () {
    const registry = yield* Registry.Registry;
    return yield* Ref.get(registry);
  }).pipe(
    Effect.provide(groupLayer),
    Effect.provideService(
      Registry.Registry,
      Ref.makeUnsafe<RegistryItems.RegistryItems>({}),
    ),
    Effect.runSync,
  );

  const { functionItems, middlewareImplItems } =
    partitionMiddlewareImplItems(registryItems);

  return mapLeaves<FunctionRegistryItem.AnyWithProps, RegisteredFunction.Any>(
    functionItems as { [key: string]: FunctionRegistryItem.AnyWithProps },
    FunctionRegistryItem.isFunctionRegistryItem,
    (registryItem) =>
      Match.value(registryItem).pipe(
        Match.tag("Convex", (item) => item.handler),
        Match.tag("Confect", (item) =>
          makeRegisteredFunction(
            databaseSchema,
            item,
            resolveMiddlewares(item, middlewareImplItems),
          ),
        ),
        Match.exhaustive,
      ),
  ) as RegisteredFunctionsForGroupSpec<Group>;
};

const partitionMiddlewareImplItems = (
  registryItems: RegistryItems.RegistryItems,
) => {
  const middlewareImplItems = new Map<
    MiddlewareKey.MiddlewareKey,
    MiddlewareRegistryItem.MiddlewareRegistryItem
  >();
  const functionItems: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(registryItems)) {
    if (MiddlewareRegistryItem.isMiddlewareRegistryItem(value)) {
      middlewareImplItems.set(value.middlewareSpec.key, value);
    } else {
      functionItems[key] = value;
    }
  }
  return { functionItems, middlewareImplItems };
};

/**
 * Pair each middleware spec attached to a function with its registered
 * implementation for the function's type. Both misses are ruled out by the
 * type system (`GroupImpl.finalize` demands every attached middleware's
 * `MiddlewareImpl` service; `MiddlewareImpl.make`/`makeByFunctionType` cover exactly
 * the declared functionTypes, which `GroupSpec.middleware` requires to cover every
 * function) — these throws are the runtime backstop for builds that ignored
 * type errors.
 */
const resolveMiddlewares = (
  registryItem: FunctionRegistryItem.ConfectFunctionRegistryItem,
  middlewareImplItems: ReadonlyMap<
    MiddlewareKey.MiddlewareKey,
    MiddlewareRegistryItem.MiddlewareRegistryItem
  >,
): ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware> =>
  registryItem.middlewareSpecs.map((middlewareSpec) => {
    const registered = middlewareImplItems.get(middlewareSpec.key);
    if (registered === undefined) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" is attached to this group's spec, but no implementation was provided — pipe the group's impl through \`Layer.provide(MiddlewareImpl.make(...))\` (or \`makeByFunctionType\`/\`provides\`).`,
      );
    }

    const middlewareImpl = registered.impls[registryItem.functionType];
    if (middlewareImpl === undefined) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" has no implementation for function type "${registryItem.functionType}", the type of function "${registryItem.name}". Declare the function type in the middleware's \`functionTypes\` and cover it in \`MiddlewareImpl.makeByFunctionType\`.`,
      );
    }

    return { middlewareSpec, middlewareImpl };
  });
