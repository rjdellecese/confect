import type * as GroupSpec from "@confect/core/GroupSpec";
import { Context, Layer } from "effect";
import type * as Api from "./Api";
import type * as FunctionImpl from "./FunctionImpl";
import { resolveGroupPathOrDie } from "./resolveGroupPath";

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
  Group extends GroupSpec.AnyWithProps,
>(
  api: Api_,
  group: Group,
): Layer.Layer<GroupImpl<string>, never, FunctionImpl.FromGroupSpec<Group>> => {
  const groupPath = resolveGroupPathOrDie(api.spec, group);

  return Layer.succeed(
    GroupImpl<string>({
      groupPath,
    }),
    {
      groupPath,
    },
  ) as Layer.Layer<GroupImpl<string>, never, FunctionImpl.FromGroupSpec<Group>>;
};

export type FromGroups<Groups extends GroupSpec.Any> = Groups extends never
  ? never
  : Groups extends GroupSpec.AnyWithProps
    ? GroupImpl<GroupSpec.Name<Groups>>
    : never;

export type FromGroupSpec<Group extends GroupSpec.AnyWithProps> =
  FunctionImpl.FromGroupSpec<Group>;
