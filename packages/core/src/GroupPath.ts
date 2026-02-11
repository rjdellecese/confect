import type { Record } from "effect";
import type * as GroupSpec from "./GroupSpec";

/**
 * Recursively generates paths for a group and its nested groups.
 *
 * - For a group with no subgroups, returns just the group name.
 * - For a group with subgroups, returns the group name plus all possible paths through its direct subgroups.
 */
export type All<
  Group extends GroupSpec.AnyWithProps,
  Depth extends 1[] = [],
> = Depth["length"] extends 15
  ? string
  : Group extends any
    ? [GroupSpec.Groups<Group>] extends [never]
      ? GroupSpec.Name<Group>
      : GroupSpec.Name<Group> | AllHelper<Group, GroupSpec.Groups<Group>, Depth>
    : never;

type AllHelper<
  Parent extends GroupSpec.AnyWithProps,
  Groups_ extends GroupSpec.AnyWithProps,
  Depth extends 1[] = [],
> = Groups_ extends GroupSpec.AnyWithProps
  ? `${GroupSpec.Name<Parent>}.${All<Groups_, [...Depth, 1]>}`
  : never;

/**
 * Recursively extracts the group at the given dot-separated path.
 * Path must match the format defined in `Path` above, e.g. "group" or "group.subgroup".
 *
 * @example
 * ```ts
 * type G = WithPath<RootGroup, "group.subgroup">;
 * ```
 */
export type GroupAt<
  Group,
  Path extends string,
> = Group extends GroupSpec.AnyWithProps
  ? Path extends `${infer Head}.${infer Tail}`
    ? Group extends { readonly name: Head }
      ? Group extends {
          readonly groups: Record.ReadonlyRecord<string, infer SubGroup>;
        }
        ? GroupAt<SubGroup, Tail>
        : never
      : never
    : GroupSpec.WithName<Group, Path>
  : never;

export type SubGroupsAt<
  Group extends GroupSpec.AnyWithProps,
  GroupPath extends string,
> =
  GroupSpec.Groups<GroupAt<Group, GroupPath>> extends infer SubGroups
    ? SubGroups extends GroupSpec.AnyWithProps
      ? `${GroupPath}.${GroupSpec.Name<SubGroups>}`
      : never
    : never;
