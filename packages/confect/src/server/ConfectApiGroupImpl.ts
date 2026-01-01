import { Context, Effect, Layer } from "effect";
import type * as ConfectApiGroupSpec from "../api/ConfectApiGroupSpec";
import type * as ConfectApi from "./ConfectApi";
import type * as ConfectApiFunctionImpl from "./ConfectApiFunctionImpl";

// ============================================================================
// ConfectApiGroupImpl Service Tag
// ============================================================================

export interface ConfectApiGroupImpl<GroupPath extends string> {
  readonly groupPath: GroupPath;
}

export const ConfectApiGroupImpl = <GroupPath extends string>({
  groupPath,
}: {
  groupPath: GroupPath;
}) =>
  Context.GenericTag<ConfectApiGroupImpl<GroupPath>>(
    `@rjdellecese/confect/server/ConfectApiGroupImpl/${groupPath}`,
  );

// ============================================================================
// make - Create Group Implementation Layer
// ============================================================================

export const make = <
  ConfectApi_ extends ConfectApi.ConfectApi.AnyWithProps,
  const GroupPath extends ConfectApiGroupSpec.Path.All<
    ConfectApi.ConfectApi.Groups<ConfectApi_>
  >,
>(
  _confectApi: ConfectApi_,
  groupPath: GroupPath,
): Layer.Layer<
  ConfectApiGroupImpl<GroupPath>,
  never,
  | ConfectApiGroupImpl.FromGroupWithPath<
      GroupPath,
      ConfectApi.ConfectApi.Groups<ConfectApi_>
    >
  | ConfectApiFunctionImpl.ConfectApiFunctionImpl.FromGroupAtPath<
      GroupPath,
      ConfectApi.ConfectApi.Groups<ConfectApi_>
    >
> => {
  return Layer.effect(
    ConfectApiGroupImpl<GroupPath>({
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
    ConfectApiGroupImpl<GroupPath>,
    never,
    | ConfectApiGroupImpl.FromGroupWithPath<
        GroupPath,
        ConfectApi.ConfectApi.Groups<ConfectApi_>
      >
    | ConfectApiFunctionImpl.ConfectApiFunctionImpl.FromGroupAtPath<
        GroupPath,
        ConfectApi.ConfectApi.Groups<ConfectApi_>
      >
  >;
};

// ============================================================================
// Namespace Types
// ============================================================================

export declare namespace ConfectApiGroupImpl {
  export type FromGroups<
    Groups extends ConfectApiGroupSpec.ConfectApiGroupSpec.Any,
  > = Groups extends never
    ? never
    : Groups extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps
      ? ConfectApiGroupImpl<
          ConfectApiGroupSpec.ConfectApiGroupSpec.Name<Groups>
        >
      : never;

  export type FromGroupWithPath<
    GroupPath extends string,
    Group extends ConfectApiGroupSpec.ConfectApiGroupSpec.AnyWithProps,
  > =
    ConfectApiGroupSpec.Path.SubGroupsAt<
      Group,
      GroupPath
    > extends infer SubGroupPaths
      ? SubGroupPaths extends string
        ? ConfectApiGroupImpl<SubGroupPaths>
        : never
      : never;
}
