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
import { Clock, Effect, Layer, Match, pipe, Schema } from "effect";
import type * as Api from "./Api";
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
            queryFunction(api.databaseSchema, {
              args: functionProvenance.args,
              returns: functionProvenance.returns,
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
            mutationFunction(api.databaseSchema, {
              args: functionProvenance.args,
              returns: functionProvenance.returns,
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
              handler: handler as Handler.AnyConfectProvenance,
            }),
          );
        }),
        Match.exhaustive,
      );
    }),
    Match.exhaustive,
  );

// Convex's query cache is invalidated by any Date.now() call during handler
// execution. Effect's unsafeFork calls Date.now() when constructing a
// FiberId.Runtime, which trips the cache for every confect-wrapped query. We
// stub Date.now to 0 for the span of the handler; queries are forbidden from
// relying on real time for correctness anyway.
//
// Users who explicitly want the real timestamp can still reach it via Effect's
// Clock service (Clock.currentTimeMillis / Clock.currentTimeNanos). We provide
// a Clock layer whose methods close over the *original* Date.now, so opting in
// to Clock is an opt-in to worse caching — but caching is not broken by default.
const unpatchedClock = (realDateNow: () => number): Clock.Clock => {
  const bigint1e6 = BigInt(1_000_000);
  const unsafeCurrentTimeMillis = () => realDateNow();
  const unsafeCurrentTimeNanos = () => BigInt(realDateNow()) * bigint1e6;
  const defaultClock = Clock.make();
  return {
    ...defaultClock,
    unsafeCurrentTimeMillis,
    unsafeCurrentTimeNanos,
    currentTimeMillis: Effect.sync(unsafeCurrentTimeMillis),
    currentTimeNanos: Effect.sync(unsafeCurrentTimeNanos),
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
>(
  databaseSchema: DatabaseSchema_,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
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
  },
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericQueryCtx<
      DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
    >,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    withStubbedDateNow((clock) =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) =>
          pipe(
            handler(decodedArgs),
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
                Layer.setConfigProvider(ConvexConfigProvider.make()),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.withClock(clock),
        Effect.runPromise,
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
    Layer.setConfigProvider(ConvexConfigProvider.make()),
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
  Schema extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>(
  schema: Schema,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
    handler: (a: Args) => Effect.Effect<Returns, E, MutationServices<Schema>>;
  },
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericMutationCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
    actualArgs: ConvexArgs,
  ): Promise<ConvexReturns> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.andThen((decodedArgs) =>
        handler(decodedArgs).pipe(Effect.provide(mutationLayer(schema, ctx))),
      ),
      Effect.andThen((convexReturns) =>
        Schema.encodeUnknown(returns)(convexReturns),
      ),
      Effect.runPromise,
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
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
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
    handler,
    createLayer: (ctx) =>
      Layer.mergeAll(
        RegisteredFunction.actionLayer(schema, ctx),
        Layer.setConfigProvider(ConvexConfigProvider.make()),
      ),
  });
