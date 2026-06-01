import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import type * as Spec from "@confect/core/Spec";
import { Effect, type Layer, Ref, type Types } from "effect";
import type * as Api from "./Api";
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
    ? GroupSpec.Groups<Group> extends infer SubGroups extends
        GroupSpec.AnyWithProps
      ? Types.Simplify<
          RegisteredFunctionsHelper<SubGroups> & {
            [FunctionName in FunctionSpec.Name<
              GroupSpec.Functions<Group>
            >]: FunctionSpec.WithName<
              GroupSpec.Functions<Group>,
              FunctionName
            > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
              ? RegisteredFunction.RegisteredFunction<FunctionSpec_>
              : never;
          }
        >
      : {
          [FunctionName in FunctionSpec.Name<
            GroupSpec.Functions<Group>
          >]: FunctionSpec.WithName<
            GroupSpec.Functions<Group>,
            FunctionName
          > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
            ? RegisteredFunction.RegisteredFunction<FunctionSpec_>
            : never;
        }
    : never;
};

export interface AnyWithProps {
  readonly [key: string]: RegisteredFunction.Any | AnyWithProps;
}

type RegisteredFunctionsAtPath<
  Tree,
  Path extends string,
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof Tree
    ? Tree[Head] extends AnyWithProps
      ? RegisteredFunctionsAtPath<Tree[Head], Tail>
      : never
    : never
  : Path extends keyof Tree
    ? Tree[Path]
    : never;

export type ForGroupPath<
  Spec_ extends Spec.AnyWithProps,
  Path extends string,
> = RegisteredFunctionsAtPath<RegisteredFunctions<Spec_>, Path>;

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
 * with any other group built in the same process. `groupPath` is therefore no
 * longer needed to navigate a shared registry tree — the built registry holds
 * exactly this group's functions at the top level — and is retained only to
 * shape the returned record's type.
 */
export const buildForGroup = <
  Api_ extends Api.AnyWithProps,
  const GroupPath_ extends string,
>(
  api: Api_,
  _groupPath: GroupPath_,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<"Finalized">>,
  makeRegisteredFunction: (
    api: Api_,
    registryItem: RegistryItem.AnyWithProps,
  ) => RegisteredFunction.Any,
): ForGroupPath<Api_["spec"], GroupPath_> => {
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
    (registryItem) => makeRegisteredFunction(api, registryItem),
  ) as ForGroupPath<Api_["spec"], GroupPath_>;
};
