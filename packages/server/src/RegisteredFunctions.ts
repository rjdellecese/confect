import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import type * as Spec from "@confect/core/Spec";
import {
  Array,
  Effect,
  type Layer,
  Option,
  pipe,
  Predicate,
  Ref,
  String,
  type Types,
} from "effect";
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
 * The `groupLayer` parameter requires `GroupImpl<string, "Finalized">`, so
 * impls that were never piped through `GroupImpl.finalize` (and impls with
 * unmet `FunctionImpl` requirements, which cannot be finalized) are rejected
 * at the codegen boundary, not just deep inside Convex at runtime.
 */
export const buildForGroup = <
  Api_ extends Api.AnyWithProps,
  const GroupPath_ extends string,
>(
  api: Api_,
  groupPath: GroupPath_,
  groupLayer: Layer.Layer<GroupImpl.GroupImpl<string, "Finalized">>,
  makeRegisteredFunction: (
    api: Api_,
    registryItem: RegistryItem.AnyWithProps,
  ) => RegisteredFunction.Any,
): ForGroupPath<Api_["spec"], GroupPath_> => {
  const registryItems = Effect.gen(function* () {
    const registry = yield* Registry.Registry;
    return yield* Ref.get(registry);
  }).pipe(Effect.provide(groupLayer), Effect.runSync);

  const registeredFunctions = mapLeaves<
    RegistryItem.AnyWithProps,
    RegisteredFunction.Any
  >(
    registryItems as { [key: string]: RegistryItem.AnyWithProps },
    RegistryItem.isRegistryItem,
    (registryItem) => makeRegisteredFunction(api, registryItem),
  );

  return pipe(
    String.split(groupPath, "."),
    Array.reduce(
      Option.some<unknown>(registeredFunctions),
      (currentNode, segment) =>
        currentNode.pipe(
          Option.filter(Predicate.isRecord),
          Option.flatMap((nodeRecord) =>
            segment in nodeRecord
              ? Option.some(nodeRecord[segment])
              : Option.none(),
          ),
        ),
    ),
    Option.getOrThrowWith(
      () => new Error(`No functions registered for group path "${groupPath}"`),
    ),
  ) as ForGroupPath<Api_["spec"], GroupPath_>;
};
