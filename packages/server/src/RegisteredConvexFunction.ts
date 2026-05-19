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
import {
  Clock,
  ConfigProvider,
  Effect,
  Layer,
  Match,
  pipe,
  Schema,
} from "effect";
import type * as Api from "./Api";
import * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as DatabaseReader from "./DatabaseReader";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as DatabaseWriter from "./DatabaseWriter";
import type * as DataModel from "./DataModel";
import type * as Handler from "./Handler";
import * as Meta from "./Meta";
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

const ConfigProviderRef = ConfigProvider.ConfigProvider;

export const make = <Api_ extends Api.AnyWithPropsWithRuntime<"Convex">>(
  api: Api_,
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
              databaseSchema: api.databaseSchema,
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
              databaseSchema: api.databaseSchema,
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
            convexActionFunction(api.databaseSchema, {
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
 * Convex's query cache is invalidated by any Date.now() call during handler
 * execution. Effect's unsafeFork calls Date.now() when constructing a
 * FiberId.Runtime, which trips the cache for every confect-wrapped query. We
 * stub Date.now to 0 for the span of the handler; queries are forbidden from
 * relying on real time for correctness anyway.
 *
 * Users who explicitly want the real timestamp can still reach it via Effect's
 * Clock service (Clock.currentTimeMillis/Clock.currentTimeNanos). We provide a
 * Clock whose user-facing Effects call realDateNow (Convex's tracker) directly,
 * making Clock an explicit opt-in to cache invalidation. The unsafe methods
 * used internally by Effect (logging, span events, scheduler) return constants
 * so they never touch the tracker—caching is not broken by default.
 */
const unpatchedClock = (realDateNow: () => number): Clock.Clock => {
  const bigint1e6 = BigInt(1_000_000);
  return {
    currentTimeMillisUnsafe: () => 0,
    currentTimeNanosUnsafe: () => 0n,
    currentTimeMillis: Effect.sync(() => realDateNow()),
    currentTimeNanos: Effect.sync(() => BigInt(realDateNow()) * bigint1e6),
    sleep: (duration) => Effect.sleep(duration),
  };
};

const withStubbedDateNow = async <T>(
  queryHandler: (clock: Clock.Clock) => Promise<T>,
): Promise<T> => {
  const realDateNow = Date.now;
  const clock = unpatchedClock(realDateNow);
  Date.now = () => 0;
  try {
    return await queryHandler(clock);
  } finally {
    Date.now = realDateNow;
  }
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
  args,
  returns,
  error,
  handler,
}: {
  databaseSchema: DatabaseSchema_;
  args: Schema.Codec<Args, ConvexArgs, never, never>;
  returns: Schema.Codec<Returns, ConvexReturns, never, never>;
  error: Schema.Codec<Error, Value, never, never> | undefined;
  handler: (
    a: Args,
  ) => Effect.Effect<
    Returns,
    E,
    | DatabaseReader.DatabaseReader<DatabaseSchema_>
    | Auth.Auth
    | StorageReader
    | QueryRunner.QueryRunner
    | Meta.QueryMeta
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
    withStubbedDateNow((clock) =>
      Effect.gen(function* () {
        const decodedArgs = yield* pipe(
          actualArgs,
          Schema.decodeEffect(args),
          Effect.orDie,
        );
        const decodedReturns = yield* handler(decodedArgs).pipe(
          Effect.provide(
            Layer.mergeAll(
              DatabaseReader.layer(databaseSchema, ctx.db),
              Auth.layer(ctx.auth),
              StorageReader.layer(ctx.storage),
              QueryRunner.layer(ctx.runQuery),
              Meta.QueryMeta.layer(ctx.meta),
              Layer.succeed(
                QueryCtx.QueryCtx<
                  DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
                >(),
                ctx,
              ),
              Layer.succeed(ConfigProviderRef, ConvexConfigProvider.make()),
            ),
          ),
        );
        return yield* pipe(
          decodedReturns,
          Schema.encodeEffect(returns),
          Effect.orDie,
        );
      }).pipe(
        Effect.provideService(Clock.Clock, clock),
        RegisteredFunction.runHandlerPromise(error),
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
    Meta.MutationMeta.layer(ctx.meta),
    Layer.succeed(
      MutationCtx.MutationCtx<
        DataModel.ToConvex<DataModel.FromSchema<Schema>>
      >(),
      ctx,
    ),
    Layer.succeed(ConfigProviderRef, ConvexConfigProvider.make()),
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
  | Meta.MutationMeta
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
  args: Schema.Codec<Args, ConvexArgs, never, never>;
  returns: Schema.Codec<Returns, ConvexReturns, never, never>;
  error: Schema.Codec<Error, Value, never, never> | undefined;
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
        Schema.decodeEffect(args),
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
    }).pipe(RegisteredFunction.runHandlerPromise(error)),
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
    args: Schema.Codec<Args, ConvexArgs, never, never>;
    returns: Schema.Codec<Returns, ConvexReturns, never, never>;
    error: Schema.Codec<any, any, never, never> | undefined;
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
        Layer.succeed(ConfigProviderRef, ConvexConfigProvider.make()),
      ),
  });
