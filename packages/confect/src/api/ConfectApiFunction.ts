import { Effect, Predicate, Schema } from "effect";
import { ConfectStorageReader, ConvexQueryCtx } from "../server";
import { ConfectAuth } from "../server/auth";
import { ConfectDatabaseReader } from "../server/database";
import { ConfectQueryRunner } from "../server/runners";
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "../server/schema";

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
  readonly args: Args;
  readonly returns: Returns;
}

export declare namespace ConfectApiFunction {
  export interface AnyWithProps
    extends ConfectApiFunction<
      string,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export type Name<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<infer Name, any, any> ? Name : never;

  export type Args<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<any, infer Args, any> ? Args : never;

  export type Returns<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<any, any, infer Returns>
      ? Returns
      : never;

  export type WithName<
    Function extends AnyWithProps,
    Name extends string,
  > = Extract<Function, { readonly name: Name }>;

  export type ExcludeName<
    Function extends AnyWithProps,
    Name extends string,
  > = Exclude<Function, { readonly name: Name }>;
}

export type Handler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunction.AnyWithProps,
> = (
  args: ConfectApiFunction.Args<Function>["Type"]
) => Effect.Effect<
  ConfectApiFunction.Returns<Function>["Type"],
  any,
  | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner
  | ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>
>;

export declare namespace Handler {
  export type WithName<
    ConfectSchema extends GenericConfectSchema,
    Function extends ConfectApiFunction.AnyWithProps,
    Name extends string,
  > = Handler<ConfectSchema, ConfectApiFunction.WithName<Function, Name>>;

  export type Any = Handler<
    GenericConfectSchema,
    ConfectApiFunction.AnyWithProps
  >;
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
