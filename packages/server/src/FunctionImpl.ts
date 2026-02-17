import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupPath from "@confect/core/GroupPath";
import type * as GroupSpec from "@confect/core/GroupSpec";
import { Array, Context, Effect, Layer, Ref, String } from "effect";
import type * as Api from "./Api";
import type * as Handler from "./Handler";
import { setNestedProperty } from "./internal/utils";
import * as Registry from "./Registry";
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
  const GroupPath_ extends GroupPath.All<Api.Groups<Api_>>,
  const FunctionName extends FunctionSpec.Name<
    GroupSpec.Functions<GroupPath.GroupAt<Api.Groups<Api_>, GroupPath_>>
  >,
>(
  api: Api_,
  groupPath: GroupPath_,
  functionName: FunctionName,
  handler: Handler.WithName<
    Api.Schema<Api_>,
    GroupSpec.Functions<GroupPath.GroupAt<Api.Groups<Api_>, GroupPath_>>,
    FunctionName
  >,
): Layer.Layer<FunctionImpl<GroupPath_, FunctionName>> => {
  const groupPathParts = String.split(groupPath, ".");
  const [firstGroupPathPart, ...restGroupPathParts] = groupPathParts;

  const group_: GroupSpec.AnyWithProps = Array.reduce(
    restGroupPathParts,
    (api as any).spec.groups[firstGroupPathPart as any]!,
    (currentGroup: any, groupPathPart: any) =>
      currentGroup.groups[groupPathPart],
  );

  const function_ = group_.functions[functionName]!;

  return Layer.effect(
    FunctionImpl<GroupPath_, FunctionName>({
      groupPath,
      functionName,
    }),
    Effect.gen(function* () {
      const registry = yield* Registry.Registry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(
          registryItems,
          [...groupPathParts, functionName],
          RegistryItem.make({
            function_,
            handler: handler as Handler.AnyWithProps,
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
 * Get all function implementation services required for a group at a given path.
 */
export type FromGroupAtPath<
  GroupPath_ extends string,
  Group extends GroupSpec.AnyWithProps,
> =
  GroupPath.GroupAt<Group, GroupPath_> extends infer GroupAtPath extends
    GroupSpec.AnyWithProps
    ? FunctionSpec.Name<
        GroupSpec.Functions<GroupAtPath>
      > extends infer FunctionNames extends string
      ? FunctionNames extends string
        ? FunctionImpl<GroupPath_, FunctionNames>
        : never
      : never
    : never;
