import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import type * as Spec from "@confect/core/Spec";
import type { Layer, Types } from "effect";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as GroupImpl from "./GroupImpl";
import { mapLeaves } from "./internal/utils";
import type * as RegisteredFunction from "./RegisteredFunction";
import * as RegistryItem from "./RegistryItem";

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
  [FunctionName in FunctionSpec.Name<
    GroupSpec.Functions<Group>
  >]: FunctionSpec.WithName<
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
    registryItem: RegistryItem.AnyWithProps,
  ) => RegisteredFunction.Any,
): RegisteredFunctionsForGroupSpec<Group> => {
  const registryItems = Effect.gen(function* () {
    const registry = yield* Registry.Registry;
    return yield* Ref.get(registry);
  }).pipe(
    Effect.provide(groupLayer),
    Effect.provideService(
      Registry.Registry,
      Ref.unsafeMake<Registry.RegistryItems>({}),
    ),
    Effect.runSync,
  );

  return mapLeaves<RegistryItem.AnyWithProps, RegisteredFunction.Any>(
    registryItems as { [key: string]: RegistryItem.AnyWithProps },
    RegistryItem.isRegistryItem,
    (registryItem) => makeRegisteredFunction(databaseSchema, registryItem),
  ) as RegisteredFunctionsForGroupSpec<Group>;
};
