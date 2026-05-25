import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import * as Registry from "@confect/core/Registry";
import { Context, Effect, Layer, Ref, String } from "effect";
import type * as Api from "./Api";
import { resolveGroupPathUnsafe } from "./GroupPath";
import type * as Handler from "./Handler";
import { setNestedProperty } from "./internal/utils";
import * as RegistryItem from "./RegistryItem";

export interface FunctionImpl<
  GroupPath_ extends string,
  FunctionName extends string,
> {
  readonly groupPath: GroupPath_;
  readonly functionName: FunctionName;
}

export const FunctionImpl = <
  GroupPath_ extends string,
  FunctionName extends string,
>({
  groupPath,
  functionName,
}: {
  groupPath: GroupPath_;
  functionName: FunctionName;
}) =>
  Context.GenericTag<FunctionImpl<GroupPath_, FunctionName>>(
    `@confect/server/FunctionImpl/${groupPath}/${functionName}`,
  );

export const make = <
  Api_ extends Api.AnyWithProps,
  Group extends GroupSpec.AnyWithProps,
  const FunctionName extends FunctionSpec.Name<GroupSpec.Functions<Group>>,
>(
  api: Api_,
  group: Group,
  functionName: FunctionName,
  handler: Handler.WithName<
    Api.Schema<Api_>,
    GroupSpec.Functions<Group>,
    FunctionName
  >,
): Layer.Layer<FunctionImpl<string, FunctionName>> => {
  const groupPath = resolveGroupPathUnsafe(api.spec, group);
  const functionSpec = group.functions[functionName]!;

  return Layer.effect(
    FunctionImpl<string, FunctionName>({
      groupPath,
      functionName,
    }),
    Effect.gen(function* () {
      const registry = yield* Registry.Registry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(
          registryItems,
          [...String.split(groupPath, "."), functionName],
          RegistryItem.make({
            functionSpec,
            handler,
          }),
        ),
      );

      return {
        groupPath,
        functionName,
      };
    }),
  );
};

/**
 * Get the function implementation service type for a specific group path and function name.
 */
export type ForGroupPathAndFunction<
  GroupPath_ extends string,
  FunctionName extends string,
> = FunctionImpl<GroupPath_, FunctionName>;

/**
 * Get all function implementation services required for a group spec.
 */
export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionSpec.Name<
    GroupSpec.Functions<Group>
  > extends infer FunctionNames extends string
    ? FunctionNames extends string
      ? FunctionImpl<string, FunctionNames>
      : never
    : never;

/**
 * @deprecated Use {@link FromGroupSpec} instead.
 */
export type FromGroupAtPath<
  _GroupPath extends string,
  Group extends GroupSpec.AnyWithProps,
> = FromGroupSpec<Group>;
