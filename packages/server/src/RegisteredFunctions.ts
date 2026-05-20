import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Spec from "@confect/core/Spec";
import type { Layer } from "effect";
import { Effect, Match, Ref, type Types } from "effect";
import type * as Api from "./Api";
import * as Impl from "./Impl";
import { mapLeaves } from "./internal/utils";
import type * as RegisteredFunction from "./RegisteredFunction";
import * as Registry from "./Registry";
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

export const make = <Api_ extends Api.AnyWithProps>(
  impl: Layer.Layer<Impl.Impl<Api_, "Finalized">>,
  makeRegisteredFunction: (
    api: Api_,
    registryItem: RegistryItem.AnyWithProps,
  ) => RegisteredFunction.Any,
) =>
  Effect.gen(function* () {
    const registry = yield* Registry.Registry;
    const functionImplItems = yield* Ref.get(registry);
    const { api, finalizationStatus } = yield* Impl.Impl<Api_, "Finalized">();

    return yield* Match.value(
      finalizationStatus as Impl.FinalizationStatus,
    ).pipe(
      Match.withReturnType<Effect.Effect<RegisteredFunctions<Api_["spec"]>>>(),
      Match.when("Unfinalized", () =>
        Effect.dieMessage("Impl is not finalized"),
      ),
      Match.when("Finalized", () =>
        Effect.succeed(
          mapLeaves<RegistryItem.AnyWithProps, RegisteredFunction.Any>(
            functionImplItems,
            RegistryItem.isRegistryItem,
            (registryItem) => makeRegisteredFunction(api, registryItem),
          ) as RegisteredFunctions<Api_["spec"]>,
        ),
      ),
      Match.exhaustive,
    );
  }).pipe(Effect.provide(impl), Effect.runSync);

export const buildForGroup = <
  Api_ extends Api.AnyWithProps,
  const GroupPath_ extends string,
>(
  api: Api_,
  groupPath: GroupPath_,
  groupLayer: Layer.Layer<never, unknown, unknown>,
  makeRegisteredFunction: (
    api: Api_,
    registryItem: RegistryItem.AnyWithProps,
  ) => RegisteredFunction.Any,
): ForGroupPath<Api_["spec"], GroupPath_> => {
  const registeredFunctions = make(
    Impl.buildForGroup(api, groupLayer),
    makeRegisteredFunction,
  ) as RegisteredFunctions<Api_["spec"]>;

  let groupFunctions: unknown = registeredFunctions;
  for (const segment of groupPath.split(".")) {
    if (
      groupFunctions === null ||
      typeof groupFunctions !== "object" ||
      !(segment in groupFunctions)
    ) {
      throw new Error(
        `No functions registered for group path "${groupPath}"`,
      );
    }
    groupFunctions = (groupFunctions as Record<string, unknown>)[segment];
  }

  return groupFunctions as ForGroupPath<Api_["spec"], GroupPath_>;
};
