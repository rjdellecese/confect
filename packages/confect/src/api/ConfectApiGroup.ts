import { Predicate, Record } from "effect";
import { GenericConfectSchema } from "../server/schema";
import * as ConfectApiFunction from "./ConfectApiFunction";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiGroup");

export type TypeId = typeof TypeId;

export const isConfectApiGroup = (u: unknown): u is ConfectApiGroup.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiGroup<
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
  Groups extends ConfectApiGroup.AnyWithProps = never,
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
    function_: Function
  ): ConfectApiGroup<ConfectSchema, Name, Functions | Function, Groups>;

  addGroup<Group extends ConfectApiGroup.AnyWithProps>(
    group: Group
  ): ConfectApiGroup<ConfectSchema, Name, Functions, Groups | Group>;
}

export declare namespace ConfectApiGroup {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly name: string;
  }

  export type AnyWithProps = ConfectApiGroup<
    GenericConfectSchema,
    string,
    ConfectApiFunction.ConfectApiFunction.AnyWithProps
  >;

  export type Name<Group> =
    Group extends ConfectApiGroup<
      infer _ConfectSchema,
      infer Name,
      infer _Functions,
      infer _Groups
    >
      ? Name
      : never;

  // Recursively generates paths for a group and its nested groups.
  // For a group with no subgroups, returns just the group name.
  // For a group with subgroups, returns the group name plus all possible paths
  // through its direct subgroups (not all groups in the union).
  export type Path<Group extends Any> = [Groups<Group>] extends [never]
    ? Name<Group>
    : Name<Group> | PathFromGroups<Group, Groups<Group>>;

  type PathFromGroups<
    Parent extends Any,
    Groups extends ConfectApiGroup.AnyWithProps,
  > = Groups extends ConfectApiGroup.AnyWithProps
    ? `${Name<Parent>}.${Path<Groups>}`
    : never;

  export type Functions<Group extends Any> =
    Group extends ConfectApiGroup<
      infer _ConfectSchema,
      infer _Name,
      infer Functions,
      infer _Groups
    >
      ? Functions
      : never;

  export type Groups<Group extends Any> =
    Group extends ConfectApiGroup<
      infer _ConfectSchema,
      infer _Name,
      infer _Functions,
      infer Groups
    >
      ? Groups
      : never;

  export type GroupNames<Group extends Any> =
    Group extends ConfectApiGroup<
      infer _ConfectSchema,
      infer _Name,
      infer _Functions,
      infer Groups
    >
      ? Groups extends never
        ? never
        : Groups["name"]
      : never;

  export type WithName<Group, Name extends string> = Extract<
    Group,
    { readonly name: Name }
  >;

  /**
   * Recursively extracts the group at the given dot-separated path.
   * Path must match the format defined in `Path` above, e.g. "group" or "group.subgroup".
   *
   * Example:
   *   type G = WithPath<RootGroup, "group.subgroup">;
   */
  export type WithPath<Group, Path extends string> = Group extends any
    ? Path extends `${infer Head}.${infer Tail}`
      ? Group extends { readonly name: Head }
        ? Group extends {
            readonly groups: Record.ReadonlyRecord<string, infer SubGroup>;
          }
          ? WithPath<SubGroup, Tail>
          : never
        : never
      : WithName<Group, Path>
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

  addGroup<Group extends ConfectApiGroup.AnyWithProps>(
    this: ConfectApiGroup.AnyWithProps,
    group: Group
  ) {
    return makeProto({
      name: this.name,
      functions: this.functions,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  Groups extends ConfectApiGroup.AnyWithProps,
>({
  name,
  functions,
  groups,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiGroup<ConfectSchema, Name, Functions, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    functions,
    groups,
  });

// TODO: Validate name (must be a valid JavaScript identifier)
export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
>(
  name: Name
): ConfectApiGroup<ConfectSchema, Name> =>
  makeProto({
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
