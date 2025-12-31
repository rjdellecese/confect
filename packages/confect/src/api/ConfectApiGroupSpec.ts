import { Predicate, Record } from "effect";
import { validateJsIdentifier } from "../internal/utils";
import type * as ConfectApiFunction from "./ConfectApiFunction";

export const TypeId = "@rjdellecese/confect/api/ConfectApiGroupSpec";
export type TypeId = typeof TypeId;

export const isConfectApiGroupSpec = (u: unknown): u is ConfectApiGroupSpec.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiGroupSpec<
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
  Groups extends ConfectApiGroupSpec.AnyWithProps = never,
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
    [GroupName in ConfectApiGroupSpec.Name<Groups>]: ConfectApiGroupSpec.WithName<
      Groups,
      GroupName
    >;
  };

  addFunction<
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  >(
    function_: Function,
  ): ConfectApiGroupSpec<Name, Functions | Function, Groups>;

  addGroup<Group extends ConfectApiGroupSpec.AnyWithProps>(
    group: Group,
  ): ConfectApiGroupSpec<Name, Functions, Groups | Group>;
}

export declare namespace ConfectApiGroupSpec {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  // TODO: Can we extend the `ConfectApiGroupSpec` interface and remove these custom fields?
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
    Group extends ConfectApiGroupSpec.AnyWithProps,
    Depth extends 1[] = [],
  > = Depth["length"] extends 15
    ? string
    : Group extends any
      ? [ConfectApiGroupSpec.Groups<Group>] extends [never]
        ? ConfectApiGroupSpec.Name<Group>
        :
            | ConfectApiGroupSpec.Name<Group>
            | AllHelper<Group, ConfectApiGroupSpec.Groups<Group>, Depth>
      : never;

  type AllHelper<
    Parent extends ConfectApiGroupSpec.AnyWithProps,
    Groups extends ConfectApiGroupSpec.AnyWithProps,
    Depth extends 1[] = [],
  > = Groups extends ConfectApiGroupSpec.AnyWithProps
    ? `${ConfectApiGroupSpec.Name<Parent>}.${All<Groups, [...Depth, 1]>}`
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
  > = Group extends ConfectApiGroupSpec.AnyWithProps
    ? Path extends `${infer Head}.${infer Tail}`
      ? Group extends { readonly name: Head }
        ? Group extends {
            readonly groups: Record.ReadonlyRecord<string, infer SubGroup>;
          }
          ? GroupAt<SubGroup, Tail>
          : never
        : never
      : ConfectApiGroupSpec.WithName<Group, Path>
    : never;

  export type SubGroupsAt<
    Group extends ConfectApiGroupSpec.AnyWithProps,
    GroupPath extends string,
  > =
    ConfectApiGroupSpec.Groups<GroupAt<Group, GroupPath>> extends infer SubGroups
      ? SubGroups extends ConfectApiGroupSpec.AnyWithProps
        ? `${GroupPath}.${ConfectApiGroupSpec.Name<SubGroups>}`
        : never
      : never;
}

const Proto = {
  [TypeId]: TypeId,

  addFunction<
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  >(this: ConfectApiGroupSpec.Any, function_: Function) {
    const this_ = this as ConfectApiGroupSpec.AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
    });
  },

  addGroup<Group extends ConfectApiGroupSpec.Any>(
    this: ConfectApiGroupSpec.Any,
    group: Group,
  ) {
    const this_ = this as ConfectApiGroupSpec.AnyWithProps;
    const group_ = group as unknown as ConfectApiGroupSpec.AnyWithProps;

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
  Groups extends ConfectApiGroupSpec.AnyWithProps,
>({
  name,
  functions,
  groups,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiGroupSpec<Name, Functions, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    functions,
    groups,
  });

export const make = <const Name extends string>(
  name: Name,
): ConfectApiGroupSpec<Name> => {
  validateJsIdentifier(name);

  return makeProto({
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
};
