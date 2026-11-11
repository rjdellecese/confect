import * as Array from "effect/Array";
import type { FunctionSpec, RuntimeAndFunctionType } from "@confect/core";
import * as IdScope from "@confect/core/IdScope";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
import * as Lazy from "@confect/core/Lazy";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "@confect/core/SchemaToValidator";
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
import { pipe } from "effect/Function";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as EffectScheduler from "effect/Scheduler";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import * as ConvexLogger from "./ConvexLogger";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as ExecutionMetadata from "./ExecutionMetadata";
import * as RequestMetadata from "./RequestMetadata";
import * as MutationRunner from "./MutationRunner";
import * as QueryRunner from "./QueryRunner";
import type * as ResolvedMiddleware from "./ResolvedMiddleware";
import * as Scheduler from "./Scheduler";
import * as Storage from "./Storage";
import * as StorageActionWriter from "./StorageActionWriter";
import * as StorageWriter from "./StorageWriter";
import * as VectorSearch from "./VectorSearch";
import type * as Handler from "./Handler";

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
> = FunctionSpec_ extends FunctionSpec.AnyWithProps
  ? FunctionSpec.GetFunctionProvenance<FunctionSpec_> extends FunctionProvenance.Convex<
      infer Args_ extends DefaultFunctionArgs,
      infer Returns_
    >
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

export const toConvexDefinition = <
  Args extends PropertyValidators,
  Returns extends Validator<any, any, any>,
  Handler_,
>(prepared: {
  readonly args: () => Args;
  readonly returns: () => Returns;
  readonly handler: Handler_;
}): { args: Args; returns: Returns; handler: Handler_ } => {
  const definition = { handler: prepared.handler };
  Lazy.defineProperty(definition, "args", prepared.args);
  Lazy.defineProperty(definition, "returns", prepared.returns);
  return definition as { args: Args; returns: Returns; handler: Handler_ };
};

/**
 * Wrap a function's handler effect in its resolved middleware chain, per
 * invocation, after args decode. Iterated innermost-first so that the
 * first-attached (group-level, in attachment order) middleware ends up
 * outermost and runs first. Erased types: the public safety story lives at the
 * `MiddlewareSpec.MiddlewareImpl`/`MiddlewareImpl.make` signatures, and the
 * composed effect's error channel is re-accounted by
 * {@link combineErrorSchemas}.
 */
export const applyMiddleware = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>,
  invocation: MiddlewareSpec.MiddlewareOptions["invocation"],
): Effect.Effect<A, any, R> =>
  Array.reduceRight(
    resolvedMiddlewares,
    effect,
    (wrapped: Effect.Effect<any, any, any>, middleware) => {
      const context =
        "options" in middleware.middlewareSpec
          ? { options: middleware.options, invocation }
          : { invocation };
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Resolved middleware is type-erased after its public implementation boundary; its error and service channels are restored by the surrounding function contract.
      return middleware.middlewareImpl(wrapped, context);
    },
  );

/**
 * The error-schema allowlist for a function with middleware: the function's own
 * declared `error` schema unioned with every covering middleware's error
 * schema. `undefined` (⇒ every failure dies) only when neither declares
 * one—mirroring the ref-side union clients decode against.
 */
export const combineErrorSchemas = (
  error: Schema.Codec<any, any> | undefined,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>,
): Schema.Codec<any, any> | undefined => {
  const schemas = [
    ...(error !== undefined ? [error] : []),
    ...MiddlewareSpec.errorSchemas(
      Array.map(resolvedMiddlewares, ({ middlewareSpec }) => middlewareSpec),
    ),
  ];
  return schemas.length === 0
    ? undefined
    : schemas.length === 1
      ? schemas[0]
      : Schema.Union(schemas);
};

/**
 * Run the `Effect` as a `Promise`. The error schema acts as an allowlist of
 * failures that may be surfaced to the client as a `ConvexError`:
 *
 * - With a schema: typed errors are schema-encoded and wrapped in a
 *   `ConvexError`, then thrown so Convex surfaces the data to the client.
 *   `Effect.result` escapes the failure channel before `runPromise` so the
 *   thrown `ConvexError` retains its `Symbol.for("ConvexError")` identity
 *   instead of being wrapped in Effect's `FiberFailure`.
 * - Without a schema: failures are converted to defects via `Effect.orDie` rather
 *   than schema-encoded. Ordinary defects reject with Effect's fiber failure;
 *   `ConvexError` defects retain the passthrough behavior below.
 *
 * Either way, a `ConvexError` _defect_—thrown imperatively rather than placed
 * in the error channel, e.g. the pagination protocol's `InvalidCursor` signal
 * from `QueryStream.paginate`—is rethrown bare so it retains its identity and
 * Convex serializes its `data` to the client, matching how a thrown
 * `ConvexError` behaves in a plain Convex handler.
 *
 * A `scheduler` in `runOptions` must be passed here as a run option rather than
 * provided via `Effect.provideService` inside `effect`: the run option lands in
 * the fiber's root context, while a service provided within `effect` pops
 * before the `orDie`/`catch`/`result` wrappers this function adds. The fiber's
 * op counter survives context pops, so a cooperative yield can fire inside
 * those wrappers—only a root-context scheduler covers them.
 */
export const runHandlerPromise =
  (
    errorSchema: Schema.Codec<any, any> | undefined,
    runOptions?: {
      readonly scheduler?: EffectScheduler.Scheduler | undefined;
    },
  ) =>
  <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
    // A `ConvexError` defect escapes into the (escaped) failure channel so
    // the `throw` below rethrows it with its identity intact.
    const rethrowConvexErrorDefects = Effect.catchDefect(
      (defect: unknown): Effect.Effect<never, ConvexError<any>> =>
        defect instanceof ConvexError
          ? Effect.fail(defect)
          : Effect.die(defect),
    );

    const withConvexError =
      errorSchema === undefined
        ? Effect.orDie(effect)
        : effect.pipe(
            Effect.catch((typedError) =>
              pipe(
                Schema.encodeEffect(errorSchema)(typedError),
                Effect.catchTag("SchemaError", Effect.die),
                Effect.andThen((encodedError) =>
                  Effect.fail(new ConvexError(encodedError)),
                ),
              ),
            ),
          );
    return Effect.runPromise(
      withConvexError.pipe(
        rethrowConvexErrorDefects,
        Effect.result,
        Effect.provideService(Console.Console, globalThis.console),
        Effect.provide(ConvexLogger.layer),
      ),
      runOptions,
    ).then(
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
  name,
  functionVisibility,
  args,
  returns,
  error,
  handler,
  resolvedMiddlewares = [],
  createLayer,
  scope = IdScope.app,
}: {
  name: string;
  functionVisibility: FunctionVisibility;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (a: Args) => Effect.Effect<Returns, E, R>;
  resolvedMiddlewares?: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
  createLayer: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
  ) => Layer.Layer<R>;
  scope?: IdScope.IdScope;
}) => ({
  args: () => compileArgsSchema(args, scope),
  returns: () => compileReturnsSchema(returns, scope),
  handler: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    Effect.gen(function* () {
      const decodedArgs = yield* pipe(
        actualArgs,
        Schema.decodeUnknownEffect(args),
        Effect.catchTag("SchemaError", Effect.die),
      );
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Middleware errors are intentionally erased here and validated by runHandlerPromise against the combined error schema below.
      const decodedReturns = yield* applyMiddleware(
        handler(decodedArgs),
        resolvedMiddlewares,
        {
          name,
          functionType: "action",
          functionVisibility,
          args: decodedArgs,
        },
      ).pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This Convex entry point provides invocation-local services before runHandlerPromise executes the handler.
        Effect.provide(createLayer(ctx)),
      );
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.catchTag("SchemaError", Effect.die),
      );
    }).pipe(runHandlerPromise(combineErrorSchemas(error, resolvedMiddlewares))),
});

export type ActionServices<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = Handler.ActionServices<DatabaseSchema_>;

export const actionLayer = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(
  databaseSchema: DatabaseSchema_,
  ctx: GenericActionCtx<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) =>
  Layer.mergeAll(
    Scheduler.layer<DatabaseSchema.Scope<DatabaseSchema_>>(
      ctx.scheduler,
      databaseSchema.target.scope,
    ),
    Auth.layerForTarget<DatabaseSchema_["target"]>(
      databaseSchema.target,
      ctx.auth,
    ),
    ExecutionMetadata.layer(ctx.meta),
    RequestMetadata.layer(ctx.meta),
    Storage.layer<DatabaseSchema.Scope<DatabaseSchema_>>(
      ctx.storage,
      databaseSchema.target.scope,
    ),
    StorageWriter.StorageWriter.layer<DatabaseSchema.Scope<DatabaseSchema_>>(
      ctx.storage,
      databaseSchema.target.scope,
    ),
    StorageActionWriter.StorageActionWriter.layer<
      DatabaseSchema.Scope<DatabaseSchema_>
    >(ctx.storage, databaseSchema.target.scope),
    QueryRunner.layer(ctx.runQuery.bind(ctx)),
    MutationRunner.layer(ctx.runMutation.bind(ctx)),
    ActionRunner.layer(ctx.runAction.bind(ctx)),
    ActionCtx.layer<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>,
      DatabaseSchema.Scope<DatabaseSchema_>
    >(ctx, databaseSchema.target.scope),
    VectorSearch.layer<DataModel.FromSchema<DatabaseSchema_>>(
      ctx.vectorSearch.bind(ctx),
    ),
  );
