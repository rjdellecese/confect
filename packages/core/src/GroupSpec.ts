import { Predicate, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import { validateJsIdentifier } from "./internal/utils";

export const TypeId = "@confect/core/api/GroupSpec";
export type TypeId = typeof TypeId;

export const isGroupSpec = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

export interface GroupSpec<
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithProps = never,
  Groups_ extends AnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name_;
  readonly functions: {
    [FunctionName in FunctionSpec.Name<Functions_>]: FunctionSpec.WithName<
      Functions_,
      FunctionName
    >;
  };
  readonly groups: {
    [GroupName in Name<Groups_>]: WithName<Groups_, GroupName>;
  };

  addFunction<Function extends FunctionSpec.AnyWithProps>(
    function_: Function,
  ): GroupSpec<Name_, Functions_ | Function, Groups_>;

  addGroup<Group extends AnyWithProps>(
    group: Group,
  ): GroupSpec<Name_, Functions_, Groups_ | Group>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

// TODO: Can we extend the `GroupSpec` interface and remove these custom fields?
export interface AnyWithProps extends Any {
  readonly name: string;
  readonly functions: {
    [key: string]: FunctionSpec.AnyWithProps;
  };
  readonly groups: {
    [key: string]: AnyWithProps;
  };
  addFunction<Function extends FunctionSpec.AnyWithProps>(
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

const Proto = {
  [TypeId]: TypeId,

  addFunction<Function extends FunctionSpec.AnyWithProps>(
    this: Any,
    function_: Function,
  ) {
    const this_ = this as AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
    });
  },

  addGroup<Group extends Any>(this: Any, group: Group) {
    const this_ = this as AnyWithProps;
    const group_ = group as unknown as AnyWithProps;

    return makeProto({
      name: this_.name,
      functions: this_.functions,
      groups: Record.set(this_.groups, group_.name, group_),
    });
  },
};

const makeProto = <
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithProps,
  Groups_ extends AnyWithProps,
>({
  name,
  functions,
  groups,
}: {
  name: Name_;
  functions: Record.ReadonlyRecord<string, Functions_>;
  groups: Record.ReadonlyRecord<string, Groups_>;
}): GroupSpec<Name_, Functions_, Groups_> =>
  Object.assign(Object.create(Proto), {
    name,
    functions,
    groups,
  });

export const make = <const Name_ extends string>(
  name: Name_,
): GroupSpec<Name_> => {
  validateJsIdentifier(name);

  return makeProto({
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
};
