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
            > extends infer Function extends FunctionSpec.AnyWithProps
              ? FunctionSpec.RegisteredFunction<Function>
              : never;
          }
        >
      : {
          [FunctionName in FunctionSpec.Name<
            GroupSpec.Functions<Group>
          >]: FunctionSpec.WithName<
            GroupSpec.Functions<Group>,
            FunctionName
          > extends infer Function extends FunctionSpec.AnyWithProps
            ? FunctionSpec.RegisteredFunction<Function>
            : never;
        }
    : never;
};

export interface AnyWithProps {
  readonly [key: string]: RegisteredFunction.RegisteredFunction | AnyWithProps;
}

export const make = <Api_ extends Api.AnyWithProps>(
  impl: Layer.Layer<Impl.Impl<Api_, "Finalized">>,
  makeRegisteredFunction: (
    api: Api_,
    registryItem: RegistryItem.AnyWithProps,
  ) => RegisteredFunction.RegisteredFunction,
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
          mapLeaves<
            RegistryItem.AnyWithProps,
            RegisteredFunction.RegisteredFunction
          >(functionImplItems, RegistryItem.isRegistryItem, (registryItem) =>
            makeRegisteredFunction(api, registryItem),
          ) as RegisteredFunctions<Api_["spec"]>,
        ),
      ),
      Match.exhaustive,
    );
  }).pipe(Effect.provide(impl), Effect.runSync);
