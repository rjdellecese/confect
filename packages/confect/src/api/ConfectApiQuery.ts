import { Predicate, Schema } from "effect";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectQuery");

export type TypeId = typeof TypeId;

export const isConfectQuery = (u: unknown): u is ConfectApiQuery<any> =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiQuery<
  Name extends string,
  Args = {},
  Returns = null,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly argsSchema: Schema.Schema<Args, unknown>;
  readonly returnsSchema: Schema.Schema<Returns, unknown>;
}

export declare namespace ConfectApiQuery {
  export interface Any {
    readonly [TypeId]: TypeId;
    readonly name: string;
  }

  export interface AnyWithProps extends ConfectApiQuery<any, any, any> {}
}

const Proto = {
  [TypeId]: TypeId,
};

export const make = <const Name extends string, Args = {}, Returns = null>({
  name,
  args,
  returns,
}: {
  name: Name;
  args: Schema.Schema<Args, unknown>;
  returns: Schema.Schema<Returns, unknown>;
}): ConfectApiQuery<Name, Args, Returns> =>
  Object.assign(Object.create(Proto), {
    name,
    argsSchema: args,
    returnsSchema: returns,
  });
