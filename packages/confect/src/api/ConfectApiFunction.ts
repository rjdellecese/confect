import { Effect, Predicate, Schema } from "effect";
import {
  ConfectScheduler,
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectVectorSearch,
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../server";
import { ConfectAuth } from "../server/auth";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} from "../server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../server/runners";
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "../server/schema";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiFunction");

export type TypeId = typeof TypeId;

export const isConfectApiFunction = (
  u: unknown
): u is ConfectApiFunction.AnyWithProps => Predicate.hasProperty(u, TypeId);

export interface ConfectApiFunction<
  FunctionType_ extends FunctionType,
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly functionType: FunctionType_;
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

export declare namespace ConfectApiFunction {
  export interface AnyWithProps
    extends ConfectApiFunction<
      FunctionType,
      string,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyWithPropsWithFunctionType<
    FunctionType_ extends FunctionType,
  > extends ConfectApiFunction<
      FunctionType_,
      string,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export type Name<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer Name,
      infer _Args,
      infer _Returns
    >
      ? Name
      : never;

  export type Args<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer _Name,
      infer Args,
      infer _Returns
    >
      ? Args
      : never;

  export type Returns<Function extends AnyWithProps> =
    Function extends ConfectApiFunction<
      infer _FunctionType,
      infer _Name,
      infer _Args,
      infer Returns
    >
      ? Returns
      : never;

  export type WithName<
    Function extends AnyWithProps,
    Name extends string,
  > = Extract<Function, { readonly name: Name }>;

  export type WithFunctionType<
    Function extends AnyWithProps,
    FunctionType_ extends FunctionType,
  > = Extract<Function, { readonly functionType: FunctionType_ }>;

  export type ExcludeName<
    Function extends AnyWithProps,
    Name extends string,
  > = Exclude<Function, { readonly name: Name }>;
}

export type Handler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunction.AnyWithProps,
> =
  Function extends ConfectApiFunction.WithFunctionType<Function, "Query">
    ? QueryHandler<ConfectSchema, Function>
    : Function extends ConfectApiFunction.WithFunctionType<Function, "Mutation">
      ? MutationHandler<ConfectSchema, Function>
      : Function extends ConfectApiFunction.WithFunctionType<Function, "Action">
        ? ActionHandler<ConfectSchema, Function>
        : never;

export type QueryHandler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunction.AnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner
  | ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>
>;

export type MutationHandler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunction.AnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectDatabaseWriter<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectAuth
  | ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConvexMutationCtx<DataModelFromConfectSchema<ConfectSchema>>
>;

export type ActionHandler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunction.AnyWithPropsWithFunctionType<"Action">,
> = BaseHandler<
  Function,
  | ConfectScheduler
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectActionRunner
  | ConfectVectorSearch
  | ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>
>;

type BaseHandler<
  Function extends ConfectApiFunction.AnyWithProps,
  Requirements,
> = <E>(
  args: ConfectApiFunction.Args<Function>["Type"]
) => Effect.Effect<
  ConfectApiFunction.Returns<Function>["Type"],
  E,
  Requirements
>;

export declare namespace Handler {
  export type AnyWithProps = Handler<
    GenericConfectSchema,
    ConfectApiFunction.AnyWithProps
  >;

  export type WithName<
    ConfectSchema extends GenericConfectSchema,
    Function extends ConfectApiFunction.AnyWithProps,
    Name extends string,
  > = Handler<ConfectSchema, ConfectApiFunction.WithName<Function, Name>>;
}

const Proto = {
  [TypeId]: TypeId,
};

type FunctionType = "Query" | "Mutation" | "Action";

export const make =
  <FT extends FunctionType>(functionType: FT) =>
  <
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
  }): ConfectApiFunction<FT, Name, Args, Returns> =>
    Object.assign(Object.create(Proto), {
      functionType,
      name,
      argsSchema: args,
      returnsSchema: returns,
    });
