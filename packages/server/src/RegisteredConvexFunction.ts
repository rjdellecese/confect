import type * as FunctionSpec from "@confect/core/FunctionSpec";
import {
  actionGeneric,
  type DefaultFunctionArgs,
  type GenericMutationCtx,
  type GenericQueryCtx,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type { Value } from "convex/values";
import { pipe } from "effect/Function";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import * as EffectScheduler from "effect/Scheduler";
import * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as DatabaseReader from "./DatabaseReader";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as DatabaseWriter from "./DatabaseWriter";
import type * as DataModel from "./DataModel";
import type * as Handler from "./Handler";
import * as MutationCtx from "./MutationCtx";
import * as MutationRunner from "./MutationRunner";
import * as QueryCtx from "./QueryCtx";
import * as QueryRunner from "./QueryRunner";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as RegistryItem from "./RegistryItem";
import * as Scheduler from "./Scheduler";
import * as SchemaToValidator from "./SchemaToValidator";
import { StorageReader } from "./StorageReader";
import { StorageWriter } from "./StorageWriter";

export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  { functionSpec, handler }: RegistryItem.AnyWithProps,
): RegisteredFunction.Any =>
  Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Convex", () => handler as RegisteredFunction.Any),
    Match.tag("Confect", () => {
      const { functionVisibility, functionProvenance } =
        functionSpec as FunctionSpec.AnyConfect;

      return Match.value(functionSpec.runtimeAndFunctionType.functionType).pipe(
        Match.when("query", () => {
          const genericFunction = Match.value(functionVisibility).pipe(
            Match.when("public", () => queryGeneric),
            Match.when("internal", () => internalQueryGeneric),
            Match.exhaustive,
          );

          return genericFunction(
            queryFunction({
              databaseSchema,
              args: functionProvenance.args,
              returns: functionProvenance.returns,
              error: functionProvenance.error,
              handler: handler as Handler.AnyConfectProvenance,
            }),
          );
        }),
        Match.when("mutation", () => {
          const genericFunction = Match.value(functionVisibility).pipe(
            Match.when("public", () => mutationGeneric),
            Match.when("internal", () => internalMutationGeneric),
            Match.exhaustive,
          );

          return genericFunction(
            mutationFunction({
              databaseSchema,
              args: functionProvenance.args,
              returns: functionProvenance.returns,
              error: functionProvenance.error,
              handler: handler as Handler.AnyConfectProvenance,
            }),
          );
        }),
        Match.when("action", () => {
          const genericFunction = Match.value(functionVisibility).pipe(
            Match.when("public", () => actionGeneric),
            Match.when("internal", () => internalActionGeneric),
            Match.exhaustive,
          );

          return genericFunction(
            convexActionFunction(databaseSchema, {
              args: functionProvenance.args,
              returns: functionProvenance.returns,
              error: functionProvenance.error,
              handler: handler as Handler.AnyConfectProvenance,
            }),
          );
        }),
        Match.exhaustive,
      );
    }),
    Match.exhaustive,
  );

/**
 * Convex evicts a query from its cache once the execution observes the current
 * time (every `Date.now()` read is tracked). Effect's logging and span
 * machinery read timestamps through the ambient `Clock`'s unsafe accessors,
 * which would silently opt any logging query out of the cache. Queries
 * therefore run with a `Clock` whose unsafe accessors return constants —
 * logging and spans never touch the tracker — while the effectful accessors
 * (`Clock.currentTimeMillis`/`currentTimeNanos`) read the real time, making
 * them an explicit opt-in to cache eviction. Raw `Date.now()` calls in handler
 * code likewise opt out honestly.
 */
const queryClock: Clock.Clock = {
  currentTimeMillisUnsafe: () => 0,
  currentTimeNanosUnsafe: () => 0n,
  currentTimeMillis: Effect.sync(() => Date.now()),
  currentTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
  // `Effect.sleep` resolves the ambient clock, so it cannot be used here — it
  // would recurse straight back into this `sleep`.
  sleep: (duration) =>
    Effect.callback<void>((resume) => {
      const handle = setTimeout(
        () => resume(Effect.void),
        Duration.toMillis(duration),
      );
      return Effect.sync(() => clearTimeout(handle));
    }),
};

/**
 * Convex bans `setTimeout` in queries and mutations ("Can't use setTimeout in
 * queries and mutations. Please consider using an action.") and their isolate
 * has no `setImmediate`. Effect's default `MixedScheduler` dispatches
 * cooperative fiber yields — injected once a fiber exhausts its op budget
 * (`MaxOpsBeforeYield`, 2048 operations) — through `setImmediate`, falling
 * back to `setTimeout(f, 0)`, so any handler that runs long enough to yield
 * would crash. Queries and mutations therefore run on a `MixedScheduler` that
 * dispatches on the microtask queue, which the isolate supports (Promises
 * work everywhere Convex functions run). Actions keep the default scheduler —
 * timers are allowed there.
 *
 * Sharing one instance across invocations is safe: `MixedScheduler` holds
 * only immutable fields, and each fiber creates its own dispatcher via
 * `makeDispatcher()`.
 */
const scheduleMicrotask: (f: () => void) => void =
  typeof globalThis.queueMicrotask === "function"
    ? globalThis.queueMicrotask.bind(globalThis)
    : (f) => void Promise.resolve().then(f);

const setImmediateMicrotask = (f: () => void): (() => void) => {
  let cancelled = false;
  scheduleMicrotask(() => {
    if (!cancelled) {
      f();
    }
  });
  return () => {
    cancelled = true;
  };
};

const microtaskScheduler: EffectScheduler.Scheduler =
  new EffectScheduler.MixedScheduler("async", setImmediateMicrotask);

const queryFunction = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>({
  databaseSchema,
  args,
  returns,
  error,
  handler,
}: {
  databaseSchema: DatabaseSchema_;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (
    a: Args,
  ) => Effect.Effect<
    Returns,
    E,
    | DatabaseReader.DatabaseReader<DatabaseSchema_>
    | Auth.Auth
    | StorageReader
    | QueryRunner.QueryRunner
    | QueryCtx.QueryCtx<
        DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
      >
  >;
}) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericQueryCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
    >,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    Effect.gen(function* () {
      const decodedArgs = yield* pipe(
        actualArgs,
        Schema.decodeUnknownEffect(args),
        Effect.orDie,
      );
      const decodedReturns = yield* handler(decodedArgs).pipe(
        Effect.provide(
          Layer.mergeAll(
            DatabaseReader.layer(databaseSchema, ctx.db),
            Auth.layer(ctx.auth),
            StorageReader.layer(ctx.storage),
            QueryRunner.layer(ctx.runQuery),
            Layer.succeed(
              QueryCtx.QueryCtx<
                DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
              >(),
              ctx,
            ),
            ConvexConfigProvider.layer,
          ),
        ),
      );
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.orDie,
      );
    }).pipe(
      Effect.provideService(Clock.Clock, queryClock),
      RegisteredFunction.runHandlerPromise(error, {
        scheduler: microtaskScheduler,
      }),
    ),
});

export const mutationLayer = <Schema extends DatabaseSchema.AnyWithProps>(
  schema: Schema,
  ctx: GenericMutationCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
) =>
  Layer.mergeAll(
    DatabaseReader.layer(schema, ctx.db),
    DatabaseWriter.layer(schema, ctx.db),
    Auth.layer(ctx.auth),
    Scheduler.layer(ctx.scheduler),
    StorageReader.layer(ctx.storage),
    StorageWriter.layer(ctx.storage),
    QueryRunner.layer(ctx.runQuery),
    MutationRunner.layer(ctx.runMutation),
    Layer.succeed(
      MutationCtx.MutationCtx<
        DataModel.ToConvex<DataModel.FromSchema<Schema>>
      >(),
      ctx,
    ),
    ConvexConfigProvider.layer,
  );

export type MutationServices<Schema extends DatabaseSchema.AnyWithProps> =
  | DatabaseReader.DatabaseReader<Schema>
  | DatabaseWriter.DatabaseWriter<Schema>
  | Auth.Auth
  | Scheduler.Scheduler
  | StorageReader
  | StorageWriter
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | MutationCtx.MutationCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>;

const mutationFunction = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>({
  databaseSchema,
  args,
  returns,
  error,
  handler,
}: {
  databaseSchema: DatabaseSchema_;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (
    a: Args,
  ) => Effect.Effect<Returns, E, MutationServices<DatabaseSchema_>>;
}) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericMutationCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
    >,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    Effect.gen(function* () {
      const decodedArgs = yield* pipe(
        actualArgs,
        Schema.decodeUnknownEffect(args),
        Effect.orDie,
      );
      const decodedReturns = yield* handler(decodedArgs).pipe(
        Effect.provide(mutationLayer(databaseSchema, ctx)),
      );
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.orDie,
      );
    }).pipe(
      RegisteredFunction.runHandlerPromise(error, {
        scheduler: microtaskScheduler,
      }),
    ),
});

const convexActionFunction = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>(
  schema: DatabaseSchema_,
  {
    args,
    returns,
    error,
    handler,
  }: {
    args: Schema.Codec<Args, ConvexArgs>;
    returns: Schema.Codec<Returns, ConvexReturns>;
    error: Schema.Codec<any, any> | undefined;
    handler: (
      a: Args,
    ) => Effect.Effect<
      Returns,
      E,
      RegisteredFunction.ActionServices<DatabaseSchema_>
    >;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    args,
    returns,
    error,
    handler,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(schema, ctx),
        ConvexConfigProvider.layer,
      ),
  });
