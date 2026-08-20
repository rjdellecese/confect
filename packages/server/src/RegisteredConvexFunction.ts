import {
  actionGeneric,
  type DefaultFunctionArgs,
  type FunctionVisibility,
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
  item: RegistryItem.ConfectRegistryItem,
  resolvedMiddlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware> = [],
): RegisteredFunction.Any => {
  const { name, functionVisibility, handler } = item;

  return Match.value(item.functionType).pipe(
    Match.when("query", () => {
      const genericFunction = Match.value(functionVisibility).pipe(
        Match.when("public", () => queryGeneric),
        Match.when("internal", () => internalQueryGeneric),
        Match.exhaustive,
      );

      return genericFunction(
        queryFunction({
          databaseSchema,
          functionName: name,
          functionVisibility,
          args: item.args,
          returns: item.returns,
          error: item.error,
          handler,
          resolvedMiddlewares,
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
          functionName: name,
          functionVisibility,
          args: item.args,
          returns: item.returns,
          error: item.error,
          handler,
          resolvedMiddlewares,
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
          functionName: name,
          functionVisibility,
          args: item.args,
          returns: item.returns,
          error: item.error,
          handler,
          resolvedMiddlewares,
        }),
      );
    }),
    Match.exhaustive,
  );
};

/**
 * Convex evicts a query from its cache once the execution observes the current
 * time (every `Date.now()` read is tracked). Effect's logging, span, and
 * elapsed-time machinery reads timestamps through the ambient `Clock`'s unsafe
 * accessors, which would silently opt any logging or timing query out of the
 * cache — and there is no untracked time source in the isolate to serve them
 * from, since Effect's own live clock falls back to `Date.now()` for monotonic
 * time when neither `process.hrtime` nor `performance.now` exists. Queries
 * therefore run with a `Clock` whose unsafe accessors all return constants, so
 * logging and spans never touch the tracker and `Effect.timed` and duration
 * metrics report a zero elapsed time, while the effectful accessors
 * (`Clock.currentTimeMillis`/`currentTimeNanos`/`monotonicTimeNanos`) read the
 * real time, making them an explicit opt-in to cache eviction. Raw `Date.now()`
 * calls in handler code likewise opt out honestly.
 */
const queryClock: Clock.Clock = {
  currentTimeMillisUnsafe: () => 0,
  currentTimeNanosUnsafe: () => 0n,
  monotonicTimeNanosUnsafe: () => 0n,
  currentTimeMillis: Effect.sync(() => Date.now()),
  currentTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
  monotonicTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
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

const queryFunction = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>({
  databaseSchema,
  functionName,
  functionVisibility,
  args,
  returns,
  error,
  handler,
  resolvedMiddlewares,
}: {
  databaseSchema: DatabaseSchema_;
  functionName: string;
  functionVisibility: FunctionVisibility;
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
  resolvedMiddlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>;
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
      const decodedReturns = yield* RegisteredFunction.applyMiddleware(
        handler(decodedArgs),
        resolvedMiddlewares,
        {
          name: functionName,
          functionType: "query",
          functionVisibility,
          args: decodedArgs,
        },
      ).pipe(
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
      RegisteredFunction.runHandlerPromise(
        RegisteredFunction.combineErrorSchemas(error, resolvedMiddlewares),
        {
          scheduler: new EffectScheduler.MixedScheduler("sync"),
        },
      ),
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
  functionName,
  functionVisibility,
  args,
  returns,
  error,
  handler,
  resolvedMiddlewares,
}: {
  databaseSchema: DatabaseSchema_;
  functionName: string;
  functionVisibility: FunctionVisibility;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (
    a: Args,
  ) => Effect.Effect<Returns, E, MutationServices<DatabaseSchema_>>;
  resolvedMiddlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>;
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
      const decodedReturns = yield* RegisteredFunction.applyMiddleware(
        handler(decodedArgs),
        resolvedMiddlewares,
        {
          name: functionName,
          functionType: "mutation",
          functionVisibility,
          args: decodedArgs,
        },
      ).pipe(Effect.provide(mutationLayer(databaseSchema, ctx)));
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.orDie,
      );
    }).pipe(
      RegisteredFunction.runHandlerPromise(
        RegisteredFunction.combineErrorSchemas(error, resolvedMiddlewares),
        {
          scheduler: new EffectScheduler.MixedScheduler("sync"),
        },
      ),
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
    functionName,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
  }: {
    functionName: string;
    functionVisibility: FunctionVisibility;
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
    resolvedMiddlewares: ReadonlyArray<RegistryItem.ResolvedMiddleware>;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    functionName,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(schema, ctx),
        ConvexConfigProvider.layer,
      ),
  });
