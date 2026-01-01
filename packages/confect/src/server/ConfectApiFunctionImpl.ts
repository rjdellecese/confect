import { Array, Context, Effect, Layer, Ref, String } from "effect";
import type * as ConfectApiFunctionSpec from "../api/ConfectApiFunctionSpec";
import type * as ConfectApiGroupSpec from "../api/ConfectApiGroupSpec";
import { setNestedProperty } from "../internal/utils";
import type * as ConfectApi from "./ConfectApi";
import * as ConfectApiRegistry from "./ConfectApiRegistry";
import * as ConfectApiRegistryItem from "./ConfectApiRegistryItem";

// ============================================================================
// ConfectApiFunctionImpl Service Tag
// ============================================================================

export interface ConfectApiFunctionImpl<
  GroupPath extends string,
  FunctionName extends string,
> {
  readonly groupPath: GroupPath;
  readonly functionName: FunctionName;
}

export const ConfectApiFunctionImpl = <
  GroupPath extends string,
  FunctionName extends string,
>({
  groupPath,
  functionName,
}: {
  groupPath: GroupPath;
  functionName: FunctionName;
}) =>
  Context.GenericTag<ConfectApiFunctionImpl<GroupPath, FunctionName>>(
    `@rjdellecese/confect/server/ConfectApiFunctionImpl/${groupPath}/${functionName}`,
  );

// ============================================================================
// make - Create Function Implementation Layer
// ============================================================================

export const make = <
  ConfectApi_ extends ConfectApi.ConfectApi.AnyWithProps,
  const GroupPath extends ConfectApiGroupSpec.Path.All<
    ConfectApi.ConfectApi.Groups<ConfectApi_>
  >,
  const FunctionName extends ConfectApiFunctionSpec.ConfectApiFunctionSpec.Name<
    ConfectApiGroupSpec.ConfectApiGroupSpec.Functions<
      ConfectApiGroupSpec.Path.GroupAt<
        ConfectApi.ConfectApi.Groups<ConfectApi_>,
        GroupPath
      >
    >
  >,
>(
  confectApi: ConfectApi_,
  groupPath: GroupPath,
  functionName: FunctionName,
  handler: ConfectApiRegistryItem.Handler.WithName<
    ConfectApi.ConfectApi.ConfectSchema<ConfectApi_>,
    ConfectApiGroupSpec.ConfectApiGroupSpec.Functions<
      ConfectApiGroupSpec.Path.GroupAt<
        ConfectApi.ConfectApi.Groups<ConfectApi_>,
        GroupPath
      >
    >,
    FunctionName
  >,
): Layer.Layer<ConfectApiFunctionImpl<GroupPath, FunctionName>> => {
  const groupPathParts = String.split(groupPath, ".");
  const [firstGroupPathPart, ...restGroupPathParts] = groupPathParts;

  const group_: ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps =
    Array.reduce(
      restGroupPathParts,
      (confectApi as any).spec.groups[firstGroupPathPart as any]!,
      (currentGroup: any, groupPathPart: any) =>
        currentGroup.groups[groupPathPart],
    );

  const function_ = group_.functions[functionName]!;

  return Layer.effect(
    ConfectApiFunctionImpl<GroupPath, FunctionName>({
      groupPath,
      functionName,
    }),
    Effect.gen(function* () {
      const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

      yield* Ref.update(registry, (registryItems) =>
        setNestedProperty(
          registryItems,
          [...groupPathParts, functionName],
          ConfectApiRegistryItem.make({
            function_,
            handler: handler as ConfectApiRegistryItem.Handler.AnyWithProps,
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

export declare namespace ConfectApiFunctionImpl {
  /**
   * Get the function implementation service type for a specific group path and function name.
   */
  export type ForGroupPathAndFunction<
    GroupPath extends string,
    FunctionName extends string,
  > = ConfectApiFunctionImpl<GroupPath, FunctionName>;

  /**
   * Get all function implementation services required for a group at a given path.
   */
  export type FromGroupAtPath<
    GroupPath extends string,
    Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps,
  > =
    ConfectApiGroupSpec.Path.GroupAt<
      Group,
      GroupPath
    > extends infer GroupAtPath extends
      ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps
      ? ConfectApiFunctionSpec.ConfectApiFunctionSpec.Name<
          ConfectApiGroupSpec.ConfectApiGroupSpec.Functions<GroupAtPath>
        > extends infer FunctionNames extends string
        ? FunctionNames extends string
          ? ConfectApiFunctionImpl<GroupPath, FunctionNames>
          : never
        : never
      : never;
}
