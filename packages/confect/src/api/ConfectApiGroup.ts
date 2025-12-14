import { Predicate, Record } from "effect";
import { validateJsIdentifier } from "../utils";
import type * as ConfectApiFunction from "./ConfectApiFunction";

export const TypeId = "@rjdellecese/confect/ConfectApiGroup";
export type TypeId = typeof TypeId;

export const isConfectApiGroup = (u: unknown): u is ConfectApiGroup.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiGroup<
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
  Groups extends ConfectApiGroup.Any = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly functions: {
    [FunctionName in Functions["name"]]: Extract<
      Functions,
      { readonly name: FunctionName }
    >;
  };
  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };

  addFunction<
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  >(
    function_: Function,
  ): ConfectApiGroup<Name, Functions | Function, Groups>;

  addGroup<Group extends ConfectApiGroup.Any>(
    group: Group,
  ): ConfectApiGroup<Name, Functions, Groups | Group>;
}

export declare namespace ConfectApiGroup {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly name: string;
  }

  export interface AnyWithProps {
    readonly [TypeId]: TypeId;
    readonly name: string;
    readonly functions: {
      [x: string]: ConfectApiFunction.ConfectApiFunction.AnyWithProps;
    };
    readonly groups: {
      [x: string]: any;
    };
    addFunction<
      Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
    >(
      function_: Function,
    ): AnyWithProps;
    addGroup<Group extends Any>(group: Group): AnyWithProps;
  }

  export type Name<Group> =
    Group extends ConfectApiGroup<infer Name_, infer _Functions, infer _Groups>
      ? Name_
      : never;

  export type Functions<Group extends Any> =
    Group extends ConfectApiGroup<infer _Name, infer Functions_, infer _Groups>
      ? Functions_
      : never;

  export type Groups<Group extends Any> =
    Group extends ConfectApiGroup<infer _Name, infer _Functions, infer Groups_>
      ? Groups_
      : never;

  export type GroupNames<Group extends Any> =
    Group extends ConfectApiGroup<infer _Name, infer _Functions, infer Groups_>
      ? Groups_ extends never
        ? never
        : Groups_["name"]
      : never;

  export type WithName<Group, Name_ extends string> = Extract<
    Group,
    { readonly name: Name_ }
  >;
}

export declare namespace Path {
  // Recursively generates paths for a group and its nested groups.
  // For a group with no subgroups, returns just the group name.
  // For a group with subgroups, returns the group name plus all possible paths
  // through its direct subgroups. Properly distributes over union types to prevent
  // cross-contamination of paths from different groups.
  export type All<Group extends ConfectApiGroup.Any> = Group extends any
    ? [ConfectApiGroup.Groups<Group>] extends [never]
      ? ConfectApiGroup.Name<Group>
      :
          | ConfectApiGroup.Name<Group>
          | AllHelper<Group, ConfectApiGroup.Groups<Group>>
    : never;

  type AllHelper<
    Parent extends ConfectApiGroup.Any,
    Groups extends ConfectApiGroup.Any,
  > = Groups extends ConfectApiGroup.Any
    ? `${ConfectApiGroup.Name<Parent>}.${All<Groups>}`
    : never;

  /**
   * Recursively extracts the group at the given dot-separated path.
   * Path must match the format defined in `Path` above, e.g. "group" or "group.subgroup".
   *
   * Example:
   *   type G = WithPath<RootGroup, "group.subgroup">;
   */
  export type GroupAt<Group, Path extends string> = Group extends any
    ? Path extends `${infer Head}.${infer Tail}`
      ? Group extends { readonly name: Head }
        ? Group extends {
            readonly groups: Record.ReadonlyRecord<string, infer SubGroup>;
          }
          ? GroupAt<SubGroup, Tail>
          : never
        : never
      : ConfectApiGroup.WithName<Group, Path>
    : never;

  export type SubGroupsAt<
    Group extends ConfectApiGroup.Any,
    GroupPath extends string,
  > =
    ConfectApiGroup.Groups<GroupAt<Group, GroupPath>> extends infer SubGroups
      ? SubGroups extends ConfectApiGroup.Any
        ? `${GroupPath}.${SubGroups["name"]}`
        : never
      : never;
}

const Proto = {
  [TypeId]: TypeId,

  addFunction<
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  >(this: ConfectApiGroup.AnyWithProps, function_: Function) {
    return makeProto({
      name: this.name,
      functions: Record.set(this.functions, function_.name, function_),
      groups: this.groups,
    });
  },

  addGroup<Group extends ConfectApiGroup.Any>(
    this: ConfectApiGroup.AnyWithProps,
    group: Group,
  ) {
    return makeProto({
      name: this.name,
      functions: this.functions,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  Groups extends ConfectApiGroup.Any,
>({
  name,
  functions,
  groups,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiGroup<Name, Functions, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    functions,
    groups,
  });

export const make = <const Name extends string>(
  name: Name,
): ConfectApiGroup<Name> => {
  validateJsIdentifier(name);

  return makeProto({
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
};
