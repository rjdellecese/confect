import type * as GroupPath from "@confect/core/GroupPath";
import type * as GroupSpec from "@confect/core/GroupSpec";
import { Context, Effect, Layer } from "effect";
import type * as Api from "./Api";
import type * as FunctionImpl from "./FunctionImpl";

export interface GroupImpl<GroupPath_ extends string> {
  readonly groupPath: GroupPath_;
}

export const GroupImpl = <GroupPath_ extends string>({
  groupPath,
}: {
  groupPath: GroupPath_;
}) =>
  Context.GenericTag<GroupImpl<GroupPath_>>(
    `@confect/server/GroupImpl/${groupPath}`,
  );

export const make = <
  Api_ extends Api.AnyWithProps,
  const GroupPath_ extends GroupPath.All<Api.Groups<Api_>>,
>(
  _api: Api_,
  groupPath: GroupPath_,
): Layer.Layer<
  GroupImpl<GroupPath_>,
  never,
  | FromGroupWithPath<GroupPath_, Api.Groups<Api_>>
  | FunctionImpl.FromGroupAtPath<GroupPath_, Api.Groups<Api_>>
> => {
  return Layer.effect(
    GroupImpl<GroupPath_>({
      groupPath,
    }),
    // TODO: Is this effect necessary?
    Effect.gen(function* () {
      // Wait for all required subgroup and function implementations to be provided
      // The Layer requirements ensure they exist before this effect runs
      yield* Effect.void;

      return {
        groupPath,
      };
    }),
  ) as Layer.Layer<
    GroupImpl<GroupPath_>,
    never,
    | FromGroupWithPath<GroupPath_, Api.Groups<Api_>>
    | FunctionImpl.FromGroupAtPath<GroupPath_, Api.Groups<Api_>>
  >;
};

export type FromGroups<Groups extends GroupSpec.Any> = Groups extends never
  ? never
  : Groups extends GroupSpec.AnyWithProps
    ? GroupImpl<GroupSpec.Name<Groups>>
    : never;

export type FromGroupWithPath<
  GroupPath_ extends string,
  Group extends GroupSpec.AnyWithProps,
> =
  GroupPath.SubGroupsAt<Group, GroupPath_> extends infer SubGroupPaths
    ? SubGroupPaths extends string
      ? GroupImpl<SubGroupPaths>
      : never
    : never;
