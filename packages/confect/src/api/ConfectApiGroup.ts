import { Predicate, Record } from "effect";
import * as ConfectApiFunction from "./ConfectApiFunction";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiGroup");

export type TypeId = typeof TypeId;

export const isConfectApiGroup = (u: unknown): u is ConfectApiGroup.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiGroup<
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.Any = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly functions: {
    [FunctionName in Functions["name"]]: Extract<
      Functions,
      { readonly name: FunctionName }
    >;
  };

  add<Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps>(
    function_: Function
  ): ConfectApiGroup<Name, Functions | Function>;
}

export declare namespace ConfectApiGroup {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly name: string;
  }

  export type AnyWithProps = ConfectApiGroup<
    string,
    ConfectApiFunction.ConfectApiFunction.AnyWithProps
  >;

  export type Name<Groups> =
    Groups extends ConfectApiGroup<infer Name, any> ? Name : never;

  export type Functions<Group extends Any> =
    Group extends ConfectApiGroup<any, infer Functions> ? Functions : never;

  export type WithName<Group, Name extends string> = Extract<
    Group,
    { readonly name: Name }
  >;

  export type HandlersFrom<
    Function extends ConfectApiFunction.ConfectApiFunction.Any,
  > = {
    readonly [Current in Function as Current["name"]]: ConfectApiFunction.Handler<Current>;
  };
}

const Proto = {
  [TypeId]: TypeId,

  add<Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps>(
    this: ConfectApiGroup.AnyWithProps,
    function_: Function
  ) {
    return makeProto({
      name: this.name,
      functions: Record.set(this.functions, function_.name, function_),
    });
  },
};

const makeProto = <
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.Any,
>({
  name,
  functions,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
}): ConfectApiGroup<Name, Functions> =>
  Object.assign(Object.create(Proto), {
    name,
    functions: functions,
  });

export const make = <const Name extends string>(
  name: Name
): ConfectApiGroup<Name> =>
  makeProto({
    name,
    functions: Record.empty(),
  });
