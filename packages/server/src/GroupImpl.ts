import { Context, Effect, Layer } from "effect";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Api from "./Api";
import type * as FunctionImpl from "./FunctionImpl";

// ============================================================================
// GroupImpl Service Tag
// ============================================================================

export interface GroupImpl<GroupPath extends string> {
  readonly groupPath: GroupPath;
}

export const GroupImpl = <GroupPath extends string>({
  groupPath,
}: {
  groupPath: GroupPath;
}) =>
  Context.GenericTag<GroupImpl<GroupPath>>(
    `@rjdellecese/confect/server/GroupImpl/${groupPath}`,
  );

// ============================================================================
// make - Create Group Implementation Layer
// ============================================================================

export const make = <
  Api_ extends Api.AnyWithProps,
  const GroupPath extends GroupSpec.All<Api.Groups<Api_>>,
>(
  _api: Api_,
  groupPath: GroupPath,
): Layer.Layer<
  GroupImpl<GroupPath>,
  never,
  | FromGroupWithPath<GroupPath, Api.Groups<Api_>>
  | FunctionImpl.FromGroupAtPath<GroupPath, Api.Groups<Api_>>
> => {
  return Layer.effect(
    GroupImpl<GroupPath>({
      groupPath,
    }),
    Effect.gen(function* () {
      // Wait for all required subgroup and function implementations to be provided
      // The Layer requirements ensure they exist before this effect runs
      yield* Effect.void;

      return {
        groupPath,
      };
    }),
  ) as Layer.Layer<
    GroupImpl<GroupPath>,
    never,
    | FromGroupWithPath<GroupPath, Api.Groups<Api_>>
    | FunctionImpl.FromGroupAtPath<GroupPath, Api.Groups<Api_>>
  >;
};

// ============================================================================
// Namespace Types
// ============================================================================

export type FromGroups<Groups extends GroupSpec.Any> = Groups extends never
  ? never
  : Groups extends GroupSpec.AnyWithProps
    ? GroupImpl<GroupSpec.Name<Groups>>
    : never;

export type FromGroupWithPath<
  GroupPath extends string,
  Group extends GroupSpec.AnyWithProps,
> =
  GroupSpec.SubGroupsAt<Group, GroupPath> extends infer SubGroupPaths
    ? SubGroupPaths extends string
      ? GroupImpl<SubGroupPaths>
      : never
    : never;
