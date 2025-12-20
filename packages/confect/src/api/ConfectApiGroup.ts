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
    [FunctionName in ConfectApiFunction.ConfectApiFunction.Name<Functions>]: ConfectApiFunction.ConfectApiFunction.WithName<
      Functions,
      FunctionName
    >;
  };
  readonly groups: {
    [GroupName in ConfectApiGroup.Name<Groups>]: ConfectApiGroup.WithName<
      Groups,
      GroupName
    >;
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
    readonly functions: {
      [key: string]: ConfectApiFunction.ConfectApiFunction.Any;
    };
    readonly groups: {
      [key: string]: Any;
    };
  }

  export interface AnyWithProps extends Any {
    readonly name: string;
    readonly functions: {
      [key: string]: ConfectApiFunction.ConfectApiFunction.AnyWithProps;
    };
    readonly groups: {
      [key: string]: AnyWithProps;
    };
    addFunction<
      Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
    >(
      function_: Function,
    ): Any;
    addGroup<Group extends Any>(group: Group): Any;
  }

  export type Name<Group extends Any> = Group["name"];

  export type Functions<Group extends Any> =
    Group["functions"][keyof Group["functions"]];

  export type Groups<Group extends Any> =
    Group["groups"][keyof Group["groups"]];

  export type GroupNames<Group extends Any> = [Groups<Group>] extends [never]
    ? never
    : Name<Groups<Group>>;

  export type WithName<Group extends Any, Name_ extends string> = Extract<
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
  export type All<
    Group extends ConfectApiGroup.Any,
    Depth extends 1[] = [],
  > = Depth["length"] extends 15
    ? string
    : Group extends any
      ? [ConfectApiGroup.Groups<Group>] extends [never]
        ? ConfectApiGroup.Name<Group>
        :
            | ConfectApiGroup.Name<Group>
            | AllHelper<Group, ConfectApiGroup.Groups<Group>, Depth>
      : never;

  type AllHelper<
    Parent extends ConfectApiGroup.Any,
    Groups extends ConfectApiGroup.Any,
    Depth extends 1[] = [],
  > = Groups extends ConfectApiGroup.Any
    ? `${ConfectApiGroup.Name<Parent>}.${All<Groups, [...Depth, 1]>}`
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
  > = Group extends ConfectApiGroup.AnyWithProps
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
        ? `${GroupPath}.${ConfectApiGroup.Name<SubGroups>}`
        : never
      : never;
}

const Proto = {
  [TypeId]: TypeId,

  addFunction<
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  >(this: ConfectApiGroup.Any, function_: Function) {
    const this_ = this as ConfectApiGroup.AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
    });
  },

  addGroup<Group extends ConfectApiGroup.Any>(
    this: ConfectApiGroup.Any,
    group: Group,
  ) {
    const this_ = this as ConfectApiGroup.AnyWithProps;
    const group_ = group as unknown as ConfectApiGroup.AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: this_.functions,
      groups: Record.set(this_.groups, group_.name, group_),
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
