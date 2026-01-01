import { Predicate, Record } from "effect";
import { validateJsIdentifier } from "../internal/utils";
import type * as FunctionSpec from "./FunctionSpec";

export const TypeId = "@rjdellecese/confect/api/GroupSpec";
export type TypeId = typeof TypeId;

export const isGroupSpec = (u: unknown): u is GroupSpec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface GroupSpec<
  Name extends string,
  Functions extends FunctionSpec.FunctionSpec.AnyWithProps = never,
  Groups extends GroupSpec.AnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly functions: {
    [FunctionName in FunctionSpec.FunctionSpec.Name<Functions>]: FunctionSpec.FunctionSpec.WithName<
      Functions,
      FunctionName
    >;
  };
  readonly groups: {
    [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
      Groups,
      GroupName
    >;
  };

  // TODO: `addQuery`, `addMutation`, `addAction`, etc.
  addFunction<Function extends FunctionSpec.FunctionSpec.AnyWithProps>(
    function_: Function,
  ): GroupSpec<Name, Functions | Function, Groups>;

  addGroup<Group extends GroupSpec.AnyWithProps>(
    group: Group,
  ): GroupSpec<Name, Functions, Groups | Group>;
}

export declare namespace GroupSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  // TODO: Can we extend the `GroupSpec` interface and remove these custom fields?
  export interface AnyWithProps extends Any {
    readonly name: string;
    readonly functions: {
      [key: string]: FunctionSpec.FunctionSpec.AnyWithProps;
    };
    readonly groups: {
      [key: string]: AnyWithProps;
    };
    addFunction<Function extends FunctionSpec.FunctionSpec.AnyWithProps>(
      function_: Function,
    ): AnyWithProps;
    addGroup<Group extends AnyWithProps>(group: Group): AnyWithProps;
  }

  export type Name<Group extends AnyWithProps> = Group["name"];

  export type Functions<Group extends AnyWithProps> =
    Group["functions"][keyof Group["functions"]];

  export type Groups<Group extends AnyWithProps> =
    Group["groups"][keyof Group["groups"]];

  export type GroupNames<Group extends AnyWithProps> = [Groups<Group>] extends [
    never,
  ]
    ? never
    : Name<Groups<Group>>;

  export type WithName<
    Group extends AnyWithProps,
    Name_ extends Name<Group>,
  > = Extract<Group, { readonly name: Name_ }>;
}

export declare namespace Path {
  // Recursively generates paths for a group and its nested groups.
  // For a group with no subgroups, returns just the group name.
  // For a group with subgroups, returns the group name plus all possible paths
  // through its direct subgroups. Properly distributes over union types to prevent
  // cross-contamination of paths from different groups.
  export type All<
    Group extends GroupSpec.AnyWithProps,
    Depth extends 1[] = [],
  > = Depth["length"] extends 15
    ? string
    : Group extends any
      ? [GroupSpec.Groups<Group>] extends [never]
        ? GroupSpec.Name<Group>
        :
            | GroupSpec.Name<Group>
            | AllHelper<Group, GroupSpec.Groups<Group>, Depth>
      : never;

  type AllHelper<
    Parent extends GroupSpec.AnyWithProps,
    Groups extends GroupSpec.AnyWithProps,
    Depth extends 1[] = [],
  > = Groups extends GroupSpec.AnyWithProps
    ? `${GroupSpec.Name<Parent>}.${All<Groups, [...Depth, 1]>}`
    : never;

  /**
   * Recursively extracts the group at the given dot-separated path.
   * Path must match the format defined in `Path` above, e.g. "group" or "group.subgroup".
   *
   * Example:
   *   type G = WithPath<RootGroup, "group.subgroup">;
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
}

const Proto = {
  [TypeId]: TypeId,

  addFunction<Function extends FunctionSpec.FunctionSpec.AnyWithProps>(
    this: GroupSpec.Any,
    function_: Function,
  ) {
    const this_ = this as GroupSpec.AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
    });
  },

  addGroup<Group extends GroupSpec.Any>(this: GroupSpec.Any, group: Group) {
    const this_ = this as GroupSpec.AnyWithProps;
    const group_ = group as unknown as GroupSpec.AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: this_.functions,
      groups: Record.set(this_.groups, group_.name, group_),
    });
  },
};

const makeProto = <
  Name extends string,
  Functions extends FunctionSpec.FunctionSpec.AnyWithProps,
  Groups extends GroupSpec.AnyWithProps,
>({
  name,
  functions,
  groups,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
  groups: Record.ReadonlyRecord<string, Groups>;
}): GroupSpec<Name, Functions, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    functions,
    groups,
  });

export const make = <const Name extends string>(
  name: Name,
): GroupSpec<Name> => {
  validateJsIdentifier(name);

  return makeProto({
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
};
