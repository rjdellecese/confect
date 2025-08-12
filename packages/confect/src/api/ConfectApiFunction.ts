import { Effect, Predicate, Schema } from "effect";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiFunction");

export type TypeId = typeof TypeId;

export const isConfectApiFunction = (
  u: unknown
): u is ConfectApiFunction<any, any, any> => Predicate.hasProperty(u, TypeId);

export interface ConfectApiFunction<
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly argsSchema: Schema.Schema<Args, unknown>;
  readonly returnsSchema: Schema.Schema<Returns, unknown>;
}

export declare namespace ConfectApiFunction {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly name: string;
  }

  export interface AnyWithProps extends ConfectApiFunction<any, any, any> {}

  export type Name<Function extends Any> =
    Function extends ConfectApiFunction<infer Name, any, any> ? Name : never;

  export type Args<Function extends Any> =
    Function extends ConfectApiFunction<any, infer Args, any> ? Args : never;

  export type Returns<Function extends Any> =
    Function extends ConfectApiFunction<any, any, infer Returns>
      ? Returns
      : never;

  export type WithName<Function extends Any, Name extends string> = Extract<
    Function,
    { readonly name: Name }
  >;

  export type ExcludeName<Function extends Any, Name extends string> = Exclude<
    Function,
    { readonly name: Name }
  >;

  export type Handler<Function extends Any> = (
    args: Args<Function>["Type"]
  ) => Returns<Function>["Type"] | Effect.Effect<Returns<Function>["Type"]>;

  export type HandlerWithName<
    Function extends Any,
    Name extends string,
  > = Handler<WithName<Function, Name>>;
}

const Proto = {
  [TypeId]: TypeId,
};

export const make = <
  const Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>({
  name,
  args,
  returns,
}: {
  name: Name;
  args: Args;
  returns: Returns;
}): ConfectApiFunction<Name, Args, Returns> =>
  Object.assign(Object.create(Proto), {
    name,
    argsSchema: args,
    returnsSchema: returns,
  });
