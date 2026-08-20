import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import type * as FunctionSpec from "./FunctionSpec";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";
import { validateConfectFunctionIdentifier } from "./Identifier";

export const TypeId = "@confect/core/GroupSpec";
export type TypeId = typeof TypeId;

export const isGroupSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

export interface GroupSpec<
  Runtime extends RuntimeAndFunctionType.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime> = never,
  // Subgroups may be of any runtime, independent of this group's own runtime: a
  // group is only a namespace for its children, which are otherwise-independent
  // modules. Functions, by contrast, stay homogeneous (a Node group only accepts
  // Node actions) — `addFunction` keeps the `<Runtime>` bound below.
  Groups_ extends AnyWithProps = never,
  Middlewares_ extends MiddlewareSpec.AnyService = never,
> {
  readonly [TypeId]: TypeId;
  readonly runtime: Runtime;
  readonly name: Name_;
  readonly functions: {
    [
      FunctionName in FunctionSpec.Name<
        FunctionSpec.AnyWithPropsWithRuntime<Runtime>
      >
    ]: FunctionSpec.WithName<Functions_, FunctionName>;
  };
  readonly groups: {
    [GroupName in Name<Groups_>]: WithName<Groups_, GroupName>;
  };
  readonly middlewares: ReadonlyArray<Middlewares_>;

  addFunction<Function extends FunctionSpec.AnyWithPropsWithRuntime<Runtime>>(
    function_: Function &
      MiddlewareSpec.ValidateAddedFunction<Function, Middlewares_>,
  ): GroupSpec<Runtime, Name_, Functions_ | Function, Groups_, Middlewares_>;

  addGroup<Group extends AnyWithProps>(
    group: Group,
  ): GroupSpec<Runtime, Name_, Functions_, Groups_ | Group, Middlewares_>;

  addGroupAt<const AtName extends string, Group extends AnyWithProps>(
    name: AtName,
    group: Group,
  ): GroupSpec<
    Runtime,
    Name_,
    Functions_,
    Groups_ | NamedAt<Group, AtName>,
    Middlewares_
  >;

  middleware<Middleware extends MiddlewareSpec.AnyService>(
    middleware: Middleware &
      MiddlewareSpec.ValidateAttach<Middleware, Functions_, Middlewares_>,
  ): GroupSpec<Runtime, Name_, Functions_, Groups_, Middlewares_ | Middleware>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends GroupSpec<
  RuntimeAndFunctionType.Runtime,
  string,
  FunctionSpec.AnyWithProps,
  AnyWithProps,
  MiddlewareSpec.AnyService
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends GroupSpec<
  Runtime,
  string,
  FunctionSpec.AnyWithPropsWithRuntime<Runtime>,
  AnyWithPropsWithRuntime<Runtime>,
  MiddlewareSpec.AnyService
> {}

export type Name<Group extends AnyWithProps> = Group["name"];

export type Functions<Group extends AnyWithProps> =
  Group["functions"][keyof Group["functions"]];

export type Groups<Group extends AnyWithProps> =
  Group["groups"][keyof Group["groups"]];

export type Middlewares<Group extends AnyWithProps> =
  Group["middlewares"][number];

export type GroupNames<Group extends AnyWithProps> = [Groups<Group>] extends [
  never,
]
  ? never
  : Name<Groups<Group>>;

export type WithName<
  Group extends AnyWithProps,
  Name_ extends Name<Group>,
> = Extract<Group, { readonly name: Name_ }>;

/** Assigns a segment name to a leaf group created with {@link make} for typing and refs. */
export type NamedAt<Group extends Any, Name_ extends string> = Omit<
  Group,
  "name"
> & {
  readonly name: Name_;
};

export type AddGroups<
  Group extends AnyWithProps,
  ExtraGroups extends AnyWithProps,
> =
  Group extends GroupSpec<
    infer Runtime,
    infer Name_,
    infer Functions_,
    infer Groups_,
    infer Middlewares_
  >
    ? GroupSpec<Runtime, Name_, Functions_, Groups_ | ExtraGroups, Middlewares_>
    : never;

const Proto = {
  [TypeId]: TypeId,

  addFunction<Function extends FunctionSpec.AnyWithProps>(
    this: Any,
    function_: Function,
  ) {
    const this_ = this as AnyWithProps;

    const overlapping = function_.middlewares.find((functionMiddleware) =>
      this_.middlewares.some(
        (groupMiddleware) => groupMiddleware.key === functionMiddleware.key,
      ),
    );
    if (overlapping !== undefined) {
      throw new Error(
        `Middleware "${overlapping.key}" is attached to both function "${function_.name}" and its group`,
      );
    }

    return makeProto({
      runtime: this_.runtime,
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
      middlewares: this_.middlewares,
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
      middlewares: this_.middlewares,
    });
  },

  addGroupAt<Group extends Any>(this: Any, name: string, group: Group) {
    const this_ = this as AnyWithProps;
    const group_ = group as unknown as AnyWithProps;

    return makeProto({
      runtime: this_.runtime,
      name: this_.name,
      functions: this_.functions,
      groups: Record.set(this_.groups, name, withName(name, group_)),
      middlewares: this_.middlewares,
    });
  },

  middleware<Middleware extends MiddlewareSpec.AnyService>(
    this: Any,
    middleware: Middleware,
  ) {
    const this_ = this as AnyWithProps;

    if (this_.middlewares.some((existing) => existing.key === middleware.key)) {
      throw new Error(
        `Middleware "${middleware.key}" is already attached to this group`,
      );
    }

    for (const function_ of Object.values(this_.functions)) {
      if (
        function_.middlewares.some(
          (existing) => existing.key === middleware.key,
        )
      ) {
        throw new Error(
          `Middleware "${middleware.key}" is attached to both function "${function_.name}" and its group`,
        );
      }
    }

    return makeProto({
      runtime: this_.runtime,
      name: this_.name,
      functions: this_.functions,
      groups: this_.groups,
      middlewares: [...this_.middlewares, middleware],
    });
  },
};

const makeProto = <
  Runtime extends RuntimeAndFunctionType.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime>,
  Groups_ extends AnyWithPropsWithRuntime<Runtime>,
  Middlewares_ extends MiddlewareSpec.AnyService,
>({
  runtime,
  name,
  functions,
  groups,
  middlewares,
}: {
  runtime: Runtime;
  name: Name_;
  functions: Record.ReadonlyRecord<string, Functions_>;
  groups: Record.ReadonlyRecord<string, Groups_>;
  middlewares: ReadonlyArray<Middlewares_>;
}): GroupSpec<Runtime, Name_, Functions_, Groups_, Middlewares_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    name,
    functions,
    groups,
    middlewares,
  });

export const make = (): GroupSpec<"Convex", ""> =>
  makeProto({
    runtime: "Convex",
    name: "",
    functions: Record.empty(),
    groups: Record.empty(),
    middlewares: [],
  });

export const makeAt = <const Name_ extends string>(
  name: Name_,
): GroupSpec<"Convex", Name_> => {
  validateConfectFunctionIdentifier(name);

  return makeProto({
    runtime: "Convex",
    name,
    functions: Record.empty(),
    groups: Record.empty(),
    middlewares: [],
  });
};

export const makeNode = (): GroupSpec<"Node", ""> =>
  makeProto({
    runtime: "Node",
    name: "",
    functions: Record.empty(),
    groups: Record.empty(),
    middlewares: [],
  });

export const makeNodeAt = <const Name_ extends string>(
  name: Name_,
): GroupSpec<"Node", Name_> => {
  validateConfectFunctionIdentifier(name);

  return makeProto({
    runtime: "Node",
    name,
    functions: Record.empty(),
    groups: Record.empty(),
    middlewares: [],
  });
};

export const withName = <const Name_ extends string>(
  name: Name_,
  group: Any,
): AnyWithProps => {
  validateConfectFunctionIdentifier(name);
  const group_ = group as AnyWithProps;

  if (group_.name === name) {
    return group_;
  }

  return makeProto({
    runtime: group_.runtime,
    name,
    functions: group_.functions,
    groups: group_.groups,
    middlewares: group_.middlewares,
  });
};
