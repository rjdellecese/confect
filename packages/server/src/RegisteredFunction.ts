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
import type { PropertyValidators, Validator, Value } from "convex/values";
import { ConvexError } from "convex/values";
import { Effect, Either, Layer, pipe, Schema } from "effect";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as MutationRunner from "./MutationRunner";
import * as QueryRunner from "./QueryRunner";
import * as Scheduler from "./Scheduler";
import * as StorageActionWriter from "./StorageActionWriter";
import * as StorageReader from "./StorageReader";
import * as StorageWriter from "./StorageWriter";
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

/**
 * Run the `Effect` as a `Promise`. The error schema acts as an allowlist of
 * failures that may be surfaced to the client as a `ConvexError`:
 *
 * - With a schema: typed errors are schema-encoded and wrapped in a
 * `ConvexError`, then thrown so Convex surfaces the data to the client.
 * `Effect.either` escapes the failure channel before `runPromise` so the thrown
 * `ConvexError` retains its `Symbol.for("ConvexError")` identity instead of
 * being wrapped in Effect's `FiberFailure`.
 *
 * - Without a schema: every failure is converted to a defect via
 * `Effect.orDie`, so nothing—not even a `ConvexError` the handler placed in its
 * error channel—reaches the client as a `ConvexError`. The fiber dies and
 * `runPromise` rejects with a generic failure.
 */
export const runHandlerPromise =
  (errorSchema: Schema.Schema.AnyNoContext | undefined) =>
  <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
    if (errorSchema === undefined) {
      return Effect.runPromise(Effect.orDie(effect));
    }
    const withConvexError = effect.pipe(
      Effect.catchAll((typedError) =>
        pipe(
          Schema.encode(errorSchema)(typedError),
          Effect.orDie,
          Effect.andThen((encodedError) =>
            Effect.fail(new ConvexError(encodedError)),
          ),
        ),
      ),
    );
    return Effect.runPromise(Effect.either(withConvexError)).then(
      Either.match({
        onLeft: (error) => {
          throw error;
        },
        onRight: (value) => value,
      }),
    );
  };

/**
 * The pair of `Schema` → `Validator` compilers used to attach Convex
 * `args`/`returns` validators to a registered function. Injected by the
 * validator-compiling builders (`RegisteredConvexFunction` /
 * `RegisteredNodeFunction`) and omitted by the validator-free builders
 * (`*WithoutValidators`). Keeping this as injected functions — rather than a
 * top-level `import * as SchemaToValidator` here — is what lets the
 * validator-free builders avoid pulling `SchemaToValidator` into a function's
 * startup import graph.
 */
export interface Compilers {
  readonly compileArgs: (
    schema: Schema.Schema.AnyNoContext,
  ) => PropertyValidators;
  readonly compileReturns: (
    schema: Schema.Schema.AnyNoContext,
  ) => Validator<any, any, any>;
}

/**
 * Build the validator-free action body — just the `{ handler }` closure that
 * decodes args, provides the layer, encodes returns, and runs the Effect. The
 * Convex `args`/`returns` validators (when wanted) are layered on by the caller
 * via {@link Compilers}; this base never references `SchemaToValidator`.
 */
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
  error,
  handler,
  createLayer,
}: {
  args: Schema.Schema<Args, ConvexArgs>;
  returns: Schema.Schema<Returns, ConvexReturns>;
  error: Schema.Schema<Error, Value> | undefined;
  handler: (a: Args) => Effect.Effect<Returns, E, R>;
  createLayer: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
  ) => Layer.Layer<R>;
}) => ({
  handler: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    Effect.gen(function* () {
      const decodedArgs = yield* pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
      );
      const decodedReturns = yield* handler(decodedArgs).pipe(
        Effect.provide(createLayer(ctx)),
      );
      return yield* pipe(decodedReturns, Schema.encode(returns), Effect.orDie);
    }).pipe(runHandlerPromise(error)),
});

export type ActionServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> =
  | Scheduler.Scheduler
  | Auth.Auth
  | StorageReader.StorageReader
  | StorageWriter.StorageWriter
  | StorageActionWriter.StorageActionWriter
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
    StorageReader.StorageReader.layer(ctx.storage),
    StorageWriter.StorageWriter.layer(ctx.storage),
    StorageActionWriter.StorageActionWriter.layer(ctx.storage),
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
