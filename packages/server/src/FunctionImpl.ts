import { Array, Context, Effect, Layer, Ref, String } from "effect";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import { setNestedProperty } from "./internal/utils";
import type * as Api from "./Api";
import * as Registry from "./Registry";
import * as RegistryItem from "./RegistryItem";

// ============================================================================
// FunctionImpl Service Tag
// ============================================================================

export interface FunctionImpl<
  GroupPath extends string,
  FunctionName extends string,
> {
  readonly groupPath: GroupPath;
  readonly functionName: FunctionName;
}

export const FunctionImpl = <
  GroupPath extends string,
  FunctionName extends string,
>({
  groupPath,
  functionName,
}: {
  groupPath: GroupPath;
  functionName: FunctionName;
}) =>
  Context.GenericTag<FunctionImpl<GroupPath, FunctionName>>(
    `@confect/server/FunctionImpl/${groupPath}/${functionName}`,
  );

// ============================================================================
// make - Create Function Implementation Layer
// ============================================================================

export const make = <
  Api_ extends Api.AnyWithProps,
  const GroupPath extends GroupSpec.All<Api.Groups<Api_>>,
  const FunctionName extends FunctionSpec.Name<
    GroupSpec.Functions<GroupSpec.GroupAt<Api.Groups<Api_>, GroupPath>>
  >,
>(
  api: Api_,
  groupPath: GroupPath,
  functionName: FunctionName,
  handler: RegistryItem.HandlerWithName<
    Api.Schema<Api_>,
    GroupSpec.Functions<GroupSpec.GroupAt<Api.Groups<Api_>, GroupPath>>,
    FunctionName
  >,
): Layer.Layer<FunctionImpl<GroupPath, FunctionName>> => {
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
    FunctionImpl<GroupPath, FunctionName>({
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
            handler: handler as RegistryItem.HandlerAnyWithProps,
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

// ============================================================================
// Namespace Types
// ============================================================================

/**
 * Get the function implementation service type for a specific group path and function name.
 */
export type ForGroupPathAndFunction<
  GroupPath extends string,
  FunctionName extends string,
> = FunctionImpl<GroupPath, FunctionName>;

/**
 * Get all function implementation services required for a group at a given path.
 */
export type FromGroupAtPath<
  GroupPath extends string,
  Group extends GroupSpec.AnyWithProps,
> =
  GroupSpec.GroupAt<Group, GroupPath> extends infer GroupAtPath extends
    GroupSpec.AnyWithProps
    ? FunctionSpec.Name<
        GroupSpec.Functions<GroupAtPath>
      > extends infer FunctionNames extends string
      ? FunctionNames extends string
        ? FunctionImpl<GroupPath, FunctionNames>
        : never
      : never
    : never;
