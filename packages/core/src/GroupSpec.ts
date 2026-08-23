import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import type * as FunctionSpec from "./FunctionSpec";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";
import { validateConfectFunctionIdentifier } from "./Identifier";

export const TypeId = "~@confect/core/GroupSpec";
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
  MiddlewareSpecs_ extends MiddlewareSpec.AnyMiddlewareSpec = never,
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
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpecs_>;
  readonly "~Functions": Functions_;
  readonly "~Groups": Groups_;

  addFunction<Function extends FunctionSpec.AnyWithPropsWithRuntime<Runtime>>(
    function_: Function &
      MiddlewareSpec.ValidateAddedFunction<Function, MiddlewareSpecs_>,
  ): GroupSpec<
    Runtime,
    Name_,
    Functions_ | Function,
    Groups_,
    MiddlewareSpecs_
  >;

  addGroup<Group extends AnyWithProps>(
    group: Group,
  ): GroupSpec<Runtime, Name_, Functions_, Groups_ | Group, MiddlewareSpecs_>;

  addGroupAt<const AtName extends string, Group extends AnyWithProps>(
    name: AtName,
    group: Group,
  ): GroupSpec<
    Runtime,
    Name_,
    Functions_,
    Groups_ | NamedAt<Group, AtName>,
    MiddlewareSpecs_
  >;

  middleware<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    middlewareSpec: MiddlewareSpec_ &
      MiddlewareSpec.ValidateAttach<
        MiddlewareSpec_,
        Functions_,
        MiddlewareSpecs_
      >,
  ): GroupSpec<
    Runtime,
    Name_,
    Functions_,
    Groups_,
    MiddlewareSpecs_ | MiddlewareSpec_
  >;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends GroupSpec<
  RuntimeAndFunctionType.Runtime,
  string,
  FunctionSpec.AnyWithProps,
  AnyWithProps,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export interface AnyWithPropsWithRuntime<
  Runtime extends RuntimeAndFunctionType.Runtime,
> extends GroupSpec<
  Runtime,
  string,
  FunctionSpec.AnyWithPropsWithRuntime<Runtime>,
  AnyWithPropsWithRuntime<Runtime>,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

export type Name<Group extends AnyWithProps> = Group["name"];

export type Functions<Group extends AnyWithProps> = Group["~Functions"];

export type Groups<Group extends AnyWithProps> = Group["~Groups"];

export type MiddlewareSpecs<Group extends AnyWithProps> =
  Group["middlewareSpecs"][number];

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
    infer MiddlewareSpecs_
  >
    ? GroupSpec<
        Runtime,
        Name_,
        Functions_,
        Groups_ | ExtraGroups,
        MiddlewareSpecs_
      >
    : never;

const Proto = {
  [TypeId]: TypeId,

  addFunction<Function extends FunctionSpec.AnyWithProps>(
    this: Any,
    function_: Function,
  ) {
    const this_ = this as AnyWithProps;

    const overlapping = function_.middlewareSpecs.find(
      (functionMiddlewareSpec) =>
        this_.middlewareSpecs.some(
          (groupMiddlewareSpec) =>
            groupMiddlewareSpec.key === functionMiddlewareSpec.key,
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
      middlewareSpecs: this_.middlewareSpecs,
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
      middlewareSpecs: this_.middlewareSpecs,
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
      middlewareSpecs: this_.middlewareSpecs,
    });
  },

  middleware<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    this: Any,
    middlewareSpec: MiddlewareSpec_,
  ) {
    const this_ = this as AnyWithProps;

    if (
      this_.middlewareSpecs.some(
        (existing) => existing.key === middlewareSpec.key,
      )
    ) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" is already attached to this group`,
      );
    }

    for (const function_ of Object.values(this_.functions)) {
      if (
        function_.middlewareSpecs.some(
          (existing) => existing.key === middlewareSpec.key,
        )
      ) {
        throw new Error(
          `Middleware "${middlewareSpec.key}" is attached to both function "${function_.name}" and its group`,
        );
      }
    }

    return makeProto({
      runtime: this_.runtime,
      name: this_.name,
      functions: this_.functions,
      groups: this_.groups,
      middlewareSpecs: [...this_.middlewareSpecs, middlewareSpec],
    });
  },
};

const makeProto = <
  Runtime extends RuntimeAndFunctionType.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime>,
  Groups_ extends AnyWithPropsWithRuntime<Runtime>,
  MiddlewareSpecs_ extends MiddlewareSpec.AnyMiddlewareSpec,
>({
  runtime,
  name,
  functions,
  groups,
  middlewareSpecs,
}: {
  runtime: Runtime;
  name: Name_;
  functions: Record.ReadonlyRecord<string, Functions_>;
  groups: Record.ReadonlyRecord<string, Groups_>;
  middlewareSpecs: ReadonlyArray<MiddlewareSpecs_>;
}): GroupSpec<Runtime, Name_, Functions_, Groups_, MiddlewareSpecs_> =>
  Object.assign(Object.create(Proto), {
    runtime,
    name,
    functions,
    groups,
    middlewareSpecs,
  }) as GroupSpec<Runtime, Name_, Functions_, Groups_, MiddlewareSpecs_>;

export const make = (): GroupSpec<"Convex", ""> =>
  makeProto({
    runtime: "Convex",
    name: "",
    functions: Record.empty(),
    groups: Record.empty(),
    middlewareSpecs: [],
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
    middlewareSpecs: [],
  });
};

export const makeNode = (): GroupSpec<"Node", ""> =>
  makeProto({
    runtime: "Node",
    name: "",
    functions: Record.empty(),
    groups: Record.empty(),
    middlewareSpecs: [],
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
    middlewareSpecs: [],
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
    middlewareSpecs: group_.middlewareSpecs,
  });
};
