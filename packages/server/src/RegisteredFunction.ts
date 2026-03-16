import type { FunctionSpec, RuntimeAndFunctionType } from "@confect/core";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
import {
  type DefaultFunctionArgs,
  type FunctionVisibility,
  type GenericActionCtx,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import { Effect, Layer, pipe, Schema } from "effect";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as MutationRunner from "./MutationRunner";
import * as QueryRunner from "./QueryRunner";
import * as Scheduler from "./Scheduler";
import * as SchemaToValidator from "./SchemaToValidator";
import { StorageActionWriter, StorageReader, StorageWriter } from "./Storage";
import * as VectorSearch from "./VectorSearch";

export type Any =
  | RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any>;

type ConfectRegisteredFunction<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> =
  FunctionSpec.EncodedArgs<FunctionSpec_> extends infer Args_ extends
    DefaultFunctionArgs
    ? RuntimeAndFunctionType.GetFunctionType<
        FunctionSpec_["runtimeAndFunctionType"]
      > extends "query"
      ? RegisteredQuery<
          FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
          Args_,
          Promise<FunctionSpec.EncodedReturns<FunctionSpec_>>
        >
      : RuntimeAndFunctionType.GetFunctionType<
            FunctionSpec_["runtimeAndFunctionType"]
          > extends "mutation"
        ? RegisteredMutation<
            FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
            Args_,
            Promise<FunctionSpec.EncodedReturns<FunctionSpec_>>
          >
        : RuntimeAndFunctionType.GetFunctionType<
              FunctionSpec_["runtimeAndFunctionType"]
            > extends "action"
          ? RegisteredAction<
              FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
              Args_,
              Promise<FunctionSpec.EncodedReturns<FunctionSpec_>>
            >
          : never
    : never;

export type ConvexRegisteredFunction<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> = FunctionSpec_ extends {
  functionProvenance: {
    _tag: "Convex";
    _args: infer Args_ extends DefaultFunctionArgs;
    _returns: infer Returns_;
  };
}
  ? RuntimeAndFunctionType.GetFunctionType<
      FunctionSpec_["runtimeAndFunctionType"]
    > extends "query"
    ? RegisteredQuery<
        FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
        Args_,
        Returns_
      >
    : RuntimeAndFunctionType.GetFunctionType<
          FunctionSpec_["runtimeAndFunctionType"]
        > extends "mutation"
      ? RegisteredMutation<
          FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
          Args_,
          Returns_
        >
      : RuntimeAndFunctionType.GetFunctionType<
            FunctionSpec_["runtimeAndFunctionType"]
          > extends "action"
        ? RegisteredAction<
            FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
            Args_,
            Returns_
          >
        : never
  : never;

export type RegisteredFunction<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
> =
  FunctionSpec_ extends FunctionSpec.WithFunctionProvenance<
    FunctionSpec_,
    FunctionProvenance.AnyConvex
  >
    ? ConvexRegisteredFunction<FunctionSpec_>
    : FunctionSpec_ extends FunctionSpec.WithFunctionProvenance<
          FunctionSpec_,
          FunctionProvenance.AnyConfect
        >
      ? ConfectRegisteredFunction<FunctionSpec_>
      : never;

export const actionFunctionBase = <
  Schema extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
  R,
>({
  args,
  returns,
  handler,
  createLayer,
}: {
  args: Schema.Schema<Args, ConvexArgs>;
  returns: Schema.Schema<Returns, ConvexReturns>;
  handler: (a: Args) => Effect.Effect<Returns, E, R>;
  createLayer: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
  ) => Layer.Layer<R>;
}) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.andThen((decodedArgs) =>
        handler(decodedArgs).pipe(Effect.provide(createLayer(ctx))),
      ),
      Effect.andThen((convexReturns) =>
        Schema.encodeUnknown(returns)(convexReturns),
      ),
      Effect.runPromise,
    ),
});

export type ActionServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> =
  | Scheduler.Scheduler
  | Auth.Auth
  | StorageReader
  | StorageWriter
  | StorageActionWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | VectorSearch.VectorSearch<DataModel.FromSchema<DatabaseSchema_>>
  | ActionCtx.ActionCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
    >;

export const actionLayer = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(
  databaseSchema: DatabaseSchema_,
  ctx: GenericActionCtx<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) =>
  Layer.mergeAll(
    Scheduler.layer(ctx.scheduler),
    Auth.layer(ctx.auth),
    StorageReader.layer(ctx.storage),
    StorageWriter.layer(ctx.storage),
    StorageActionWriter.layer(ctx.storage),
    QueryRunner.layer(ctx.runQuery),
    MutationRunner.layer(ctx.runMutation),
    ActionRunner.layer(ctx.runAction),
    VectorSearch.layer(ctx.vectorSearch),
    Layer.succeed(
      ActionCtx.ActionCtx<
        DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
      >(),
      ctx,
    ),
  );
