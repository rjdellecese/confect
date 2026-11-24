import * as Array from "effect/Array";
import type { FunctionSpec, RuntimeAndFunctionType } from "@confect/core";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
import * as Lazy from "@confect/core/Lazy";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "@confect/core/SchemaToValidator";
import type {
  DefaultFunctionArgs,
  FunctionVisibility,
  GenericActionCtx,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { GenericValidator, PropertyValidators } from "convex/values";
import { ConvexError } from "convex/values";
import { pipe } from "effect/Function";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as Scheduler_ from "effect/Scheduler";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import * as ConvexLogger from "./ConvexLogger";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type * as Handler from "./Handler";
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

/**
 * @internal
 */
export type Any =
  | RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, unknown>
  | RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, unknown>
  | RegisteredAction<FunctionVisibility, DefaultFunctionArgs, unknown>;

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

/**
 * @internal
 */
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

/**
 * @internal
 */
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

interface ConvexDefinition<Args, Returns, Handler_> {
  args: Args;
  returns: Returns;
  handler: Handler_;
}

/**
 * @internal
 */
export const toConvexDefinition = <
  Args extends PropertyValidators,
  Returns extends GenericValidator,
  Handler_,
>(prepared: {
  readonly args: () => Args;
  readonly returns: () => Returns;
  readonly handler: Handler_;
}): ConvexDefinition<Args, Returns, Handler_> => {
  const definition = { handler: prepared.handler };
  Lazy.defineProperty(definition, "args", prepared.args);
  Lazy.defineProperty(definition, "returns", prepared.returns);
  return definition;
};

/**
 * Wrap a function's handler effect in its resolved middleware chain, per
 * invocation, after args decode. Iterated innermost-first so that the
 * first-attached (group-level, in attachment order) middleware ends up
 * outermost and runs first. Erased types: the public safety story lives at the
 * `MiddlewareSpec.MiddlewareImpl`/`MiddlewareImpl.make` signatures, and the
 * composed effect's error channel is re-accounted by
 * {@link combineErrorSchemas}.
 *
 * @internal
 */
export const applyMiddleware = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>,
  invocation: MiddlewareSpec.MiddlewareOptions["invocation"],
): Effect.Effect<A, unknown, R> =>
  // oxlint-disable-next-line typescript/no-unsafe-return -- MiddlewareImpl's opaque success contract preserves the handler's A across the chain; a heterogeneous array no longer carries that witness.
  Array.reduceRight<
    ResolvedMiddleware.ResolvedMiddleware,
    // oxlint-disable-next-line typescript/no-explicit-any -- SuccessValue hides A from each user wrapper. This accumulator must carry the original A into and back out of those opaque wrappers.
    Effect.Effect<any, unknown, R>
    // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Each wrapper can add its spec's own error; the heterogeneous chain has no narrower error type until the combined error codec validates it.
  >(resolvedMiddlewares, effect, (wrapped, middleware) => {
    const context =
      "options" in middleware.middlewareSpec
        ? { options: middleware.options, invocation }
        : { invocation };
    // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context, typescript/no-unsafe-return, typescript/no-unsafe-argument -- The public wrapper signature preserves the opaque success and its spec controls service provisioning; registration erases those types before composition.
    return middleware.middlewareImpl(wrapped, context);
  });

/**
 * The error-schema allowlist for a function with middleware: the function's own
 * declared `error` schema unioned with every covering middleware's error
 * schema. `undefined` (⇒ every failure dies) only when neither declares
 * one—mirroring the ref-side union clients decode against.
 *
 * @internal
 */
export const combineErrorSchemas = (
  error: Schema.Codec<unknown> | undefined,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>,
): Schema.Codec<unknown> | undefined => {
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
 *
 * @internal
 */
export const runHandlerPromise =
  (
    // oxlint-disable-next-line typescript/no-explicit-any -- Function specs permit arbitrary error codecs, including readonly encoded arrays that Convex serializes but its mutable Value type cannot describe.
    errorSchema: Schema.Codec<unknown, any> | undefined,
    runOptions?: {
      readonly scheduler?: Scheduler_.Scheduler | undefined;
    },
  ) =>
  <A, E>(effect: Effect.Effect<A, E>): Promise<A> => {
    // A `ConvexError` defect escapes into the (escaped) failure channel so
    // the `throw` below rethrows it with its identity intact.
    const rethrowConvexErrorDefects = Effect.catchDefect(
      (defect: unknown): Effect.Effect<never, Error> =>
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

/**
 * @internal
 */
export const actionFunctionBase = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
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
}: {
  name: string;
  functionVisibility: FunctionVisibility;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<unknown> | undefined;
  handler: (a: Args) => Effect.Effect<Returns, E, R>;
  resolvedMiddlewares?: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
  createLayer: (
    ctx: GenericActionCtx<
      DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >,
  ) => Layer.Layer<R>;
}) => ({
  args: () => compileArgsSchema(args),
  returns: () => compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<
      DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >,
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

/**
 * @internal
 */
export const actionLayer = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(
  ctx: GenericActionCtx<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
): Layer.Layer<Handler.ActionServices<DatabaseSchema_>> =>
  Layer.mergeAll(
    Scheduler.layer(ctx.scheduler),
    Auth.layer(ctx.auth),
    ExecutionMetadata.layer(ctx.meta),
    RequestMetadata.layer(ctx.meta),
    Storage.layer(ctx.storage),
    StorageWriter.StorageWriter.layer(ctx.storage),
    StorageActionWriter.StorageActionWriter.layer(ctx.storage),
    QueryRunner.layer(ctx.runQuery.bind(ctx)),
    MutationRunner.layer(ctx.runMutation.bind(ctx)),
    ActionRunner.layer(ctx.runAction.bind(ctx)),
    Layer.succeed(
      ActionCtx.ActionCtx<
        DataModel.ToConvexDataModel<
          DataModel.FromDatabaseSchema<DatabaseSchema_>
        >
      >(),
      ctx,
    ),
    VectorSearch.layer<DataModel.FromDatabaseSchema<DatabaseSchema_>>(
      ctx.vectorSearch.bind(ctx),
    ),
  );
