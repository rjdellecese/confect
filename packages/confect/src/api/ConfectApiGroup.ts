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
  ): ConfectApiGroup<ConfectSchema, Name, Functions | Function>;
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

  export type Name<Groups> =
    Groups extends ConfectApiGroup<
      infer _ConfectSchema,
      infer Name,
      infer _Functions
    >
      ? Name
      : never;

  export type Functions<Group extends Any> =
    Group extends ConfectApiGroup<
      infer _ConfectSchema,
      infer _Name,
      infer Functions
    >
      ? Functions
      : never;

  export type WithName<Group, Name extends string> = Extract<
    Group,
    { readonly name: Name }
  >;

  export type HandlersFrom<
    ConfectSchema extends GenericConfectSchema,
    Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
  > = {
    readonly [Current in Function as Current["name"]]: ConfectApiFunction.Handler<
      ConfectSchema,
      Current
    >;
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
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
>({
  name,
  functions,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
}): ConfectApiGroup<ConfectSchema, Name, Functions> =>
  Object.assign(Object.create(Proto), {
    name,
    functions: functions,
  });

export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
>(
  name: Name
): ConfectApiGroup<ConfectSchema, Name> =>
  makeProto({
    name,
    functions: Record.empty(),
  });
