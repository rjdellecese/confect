import { Predicate, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as Runtime from "./Runtime";
import { validateConfectFunctionIdentifier } from "./internal/utils";

export const TypeId = "@confect/core/GroupSpec";
export type TypeId = typeof TypeId;

export const isGroupSpec = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

export interface GroupSpec<
  Runtime_ extends Runtime.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime_> = never,
  Groups_ extends AnyWithPropsWithRuntime<Runtime_> = never,
> {
  readonly [TypeId]: TypeId;
  readonly runtime: Runtime_;
  readonly name: Name_;
  readonly functions: {
    [FunctionName in FunctionSpec.Name<
      FunctionSpec.AnyWithPropsWithRuntime<Runtime_>
    >]: FunctionSpec.WithName<Functions_, FunctionName>;
  };
  readonly groups: {
    [GroupName in Name<Groups_>]: WithName<Groups_, GroupName>;
  };

  addFunction<Function extends FunctionSpec.AnyWithPropsWithRuntime<Runtime_>>(
    function_: Function,
  ): GroupSpec<Runtime_, Name_, Functions_ | Function, Groups_>;

  addGroup<Group extends AnyWithPropsWithRuntime<Runtime_>>(
    group: Group,
  ): GroupSpec<Runtime_, Name_, Functions_, Groups_ | Group>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends GroupSpec<
  Runtime.Runtime,
  string,
  FunctionSpec.AnyWithProps,
  AnyWithProps
> {}

export interface AnyWithPropsWithRuntime<
  Runtime_ extends Runtime.Runtime,
> extends GroupSpec<
  Runtime_,
  string,
  FunctionSpec.AnyWithPropsWithRuntime<Runtime_>,
  AnyWithPropsWithRuntime<Runtime_>
> {}

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
      runtime: this_.runtime,
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
    });
  },

  addGroup<Group extends Any>(this: Any, group: Group) {
    const this_ = this as AnyWithProps;
    const group_ = group as unknown as AnyWithProps;

    return makeProto({
      runtime: this_.runtime,
      name: this_.name,
      functions: this_.functions,
      groups: Record.set(this_.groups, group_.name, group_),
    });
  },
};

const makeProto = <
  Runtime_ extends Runtime.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime_>,
  Groups_ extends AnyWithPropsWithRuntime<Runtime_>,
>({
  runtime,
  name,
  functions,
  groups,
}: {
  runtime: Runtime_;
  name: Name_;
  functions: Record.ReadonlyRecord<string, Functions_>;
  groups: Record.ReadonlyRecord<string, Groups_>;
}): GroupSpec<Runtime_, Name_, Functions_, Groups_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    name,
    functions,
    groups,
  });

export const make = <const Name_ extends string>(
  name: Name_,
): GroupSpec<"Convex", Name_> => {
  // TODO: Ensure that group named `"node"` is not allowed at the top-level
  validateConfectFunctionIdentifier(name);

  return makeProto({
    runtime: "Convex",
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
};

export const makeNode = <const Name_ extends string>(
  name: Name_,
): GroupSpec<"Node", Name_> => {
  validateConfectFunctionIdentifier(name);

  return makeProto({
    runtime: "Node",
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
};
