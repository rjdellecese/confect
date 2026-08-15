import type { FunctionSpec, RuntimeAndFunctionType } from "@confect/core";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import {
  type DefaultFunctionArgs,
  type FunctionVisibility,
  type GenericActionCtx,
  type GenericDataModel,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import type { Value } from "convex/values";
import { ConvexError } from "convex/values";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as EffectScheduler from "effect/Scheduler";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as MutationRunner from "./MutationRunner";
import * as QueryRunner from "./QueryRunner";
import type * as RegistryItem from "./RegistryItem";
import * as Scheduler from "./Scheduler";
import * as SchemaToValidator from "./SchemaToValidator";
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
 *
 * A `scheduler` in `runOptions` must be passed here as a run option rather
 * than provided via `Effect.provideService` inside `effect`: the run option
 * lands in the fiber's root context, while a service provided within `effect`
 * pops before the `orDie`/`catch`/`result` wrappers this function adds. The
 * fiber's op counter survives context pops, so a cooperative yield can fire
 * inside those wrappers — only a root-context scheduler covers them.
 */
/**
 * Wrap a function's handler effect in its resolved middleware chain, per
 * invocation, after args decode. Iterated innermost-first so that the
 * first-attached (group-level, in attachment order) middleware ends up
 * outermost and runs first. Erased types: the public safety story lives at
 * the `MiddlewareSpec.Middleware` / `MiddlewareImpl.make` signatures, and
 * the composed effect's error channel is re-accounted by
 * {@link combineErrorSchemas}.
 */
export const applyMiddleware = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  middlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>,
  options: {
    readonly spec: FunctionSpec.AnyWithProps;
    readonly args: unknown;
  },
  // The composed effect's success and environment are preserved (middleware
  // returns the handler's opaque `SuccessValue`, and its own requirements
  // are bounded by `MiddlewareImpl.CommonServices`, a subset of every
  // covered function type's ctx union — i.e. of `R`); only the error channel widens,
  // by the middlewares' declared errors.
): Effect.Effect<A, any, R> => {
  let wrapped: Effect.Effect<any, any, any> = effect;
  for (let index = middlewares.length - 1; index >= 0; index--) {
    wrapped = middlewares[index]!.impl(wrapped as any, options) as any;
  }
  return wrapped as Effect.Effect<A, any, R>;
};

/**
 * The error-schema allowlist for a function with middleware: the function's
 * own declared `error` schema unioned with every covering middleware's
 * error schema. `undefined` (⇒ every failure dies) only when neither
 * declares one — mirroring the ref-side union clients decode against.
 */
export const combineErrorSchemas = (
  error: Schema.Codec<any, any> | undefined,
  middlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>,
): Schema.Codec<any, any> | undefined => {
  const schemas = [
    ...(error !== undefined ? [error] : []),
    ...MiddlewareSpec.errorSchemas(
      middlewares.map(({ middleware }) => middleware),
    ),
  ];
  return schemas.length === 0
    ? undefined
    : schemas.length === 1
      ? schemas[0]
      : Schema.Union(schemas);
};

export const runHandlerPromise =
  (
    errorSchema: Schema.Codec<any, any> | undefined,
    runOptions?: {
      readonly scheduler?: EffectScheduler.Scheduler | undefined;
    },
  ) =>
  <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
    if (errorSchema === undefined) {
      return Effect.runPromise(Effect.orDie(effect), runOptions);
    }
    const withConvexError = effect.pipe(
      Effect.catch((typedError) =>
        pipe(
          Schema.encodeEffect(errorSchema)(typedError),
          Effect.orDie,
          Effect.andThen((encodedError) =>
            Effect.fail(new ConvexError(encodedError)),
          ),
        ),
      ),
    );
    return Effect.runPromise(Effect.result(withConvexError), runOptions).then(
      Result.match({
        onFailure: (error) => {
          throw error;
        },
        onSuccess: (value) => value,
      }),
    );
  };

export const actionFunctionBase = <
  Schema extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
  R,
>({
  functionSpec,
  args,
  returns,
  error,
  handler,
  middlewares = [],
  createLayer,
}: {
  functionSpec: FunctionSpec.AnyWithProps;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (a: Args) => Effect.Effect<Returns, E, R>;
  middlewares?: ReadonlyArray<RegistryItem.ResolvedMiddleware>;
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
    Effect.gen(function* () {
      const decodedArgs = yield* pipe(
        actualArgs,
        Schema.decodeUnknownEffect(args),
        Effect.orDie,
      );
      const decodedReturns = yield* applyMiddleware(
        handler(decodedArgs),
        middlewares,
        { spec: functionSpec, args: decodedArgs },
      ).pipe(Effect.provide(createLayer(ctx)));
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.orDie,
      );
    }).pipe(runHandlerPromise(combineErrorSchemas(error, middlewares))),
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

/**
 * The ctx-backed action services that don't depend on a Confect database
 * schema. {@link actionLayer} adds the schema-typed `VectorSearch` on top;
 * the HTTP API handler uses this base directly.
 */
export const baseActionLayer = <ConvexDataModel extends GenericDataModel>(
  ctx: GenericActionCtx<ConvexDataModel>,
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
    Layer.succeed(ActionCtx.ActionCtx<ConvexDataModel>(), ctx),
  );

export const actionLayer = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(
  databaseSchema: DatabaseSchema_,
  ctx: GenericActionCtx<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) => Layer.mergeAll(baseActionLayer(ctx), VectorSearch.layer(ctx.vectorSearch));
