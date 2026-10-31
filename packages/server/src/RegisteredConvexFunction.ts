import {
  compileArgsSchema,
  compileReturnsSchema,
} from "@confect/core/SchemaToValidator";
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
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import * as EffectScheduler from "effect/Scheduler";
import * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as DatabaseReader from "./DatabaseReader";
import * as DocumentIds from "./DocumentIds";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as DatabaseWriter from "./DatabaseWriter";
import type * as DataModel from "./DataModel";
import * as ExecutionMetadata from "./ExecutionMetadata";
import * as RequestMetadata from "./RequestMetadata";
import * as TransactionMetadata from "./TransactionMetadata";
import * as MutationCtx from "./MutationCtx";
import * as MutationRunner from "./MutationRunner";
import * as MutationTransactionContext from "./MutationTransactionContext";
import * as QueryCtx from "./QueryCtx";
import * as QueryRunner from "./QueryRunner";
import * as QueryTransactionContext from "./QueryTransactionContext";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as FunctionRegistryItem from "./FunctionRegistryItem";
import type * as ResolvedMiddleware from "./ResolvedMiddleware";
import * as Scheduler from "./Scheduler";
import * as Storage from "./Storage";
import { StorageWriter } from "./StorageWriter";
import type * as Handler from "./Handler";

export type Definition = Data.TaggedEnum<{
  PublicQuery: ReturnType<typeof queryFunction>;
  InternalQuery: ReturnType<typeof queryFunction>;
  PublicMutation: ReturnType<typeof mutationFunction>;
  InternalMutation: ReturnType<typeof mutationFunction>;
  PublicAction: ReturnType<typeof convexActionFunction>;
  InternalAction: ReturnType<typeof convexActionFunction>;
  Registered: { readonly handler: RegisteredFunction.Any };
}>;
export const Definition = Data.taggedEnum<Definition>();

export const prepare = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  item: FunctionRegistryItem.ConfectFunctionRegistryItem,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware> = [],
) =>
  Match.value(item.functionType).pipe(
    Match.when("query", () => {
      const definition = queryFunction({
        databaseSchema,
        name: item.name,
        functionVisibility: item.functionVisibility,
        args: item.args,
        returns: item.returns,
        error: item.error,
        handler: item.handler,
        resolvedMiddlewares,
      });
      return Match.value(item.functionVisibility).pipe(
        Match.when("public", () => Definition.PublicQuery(definition)),
        Match.when("internal", () => Definition.InternalQuery(definition)),
        Match.exhaustive,
      );
    }),
    Match.when("mutation", () => {
      const definition = mutationFunction({
        databaseSchema,
        name: item.name,
        functionVisibility: item.functionVisibility,
        args: item.args,
        returns: item.returns,
        error: item.error,
        handler: item.handler,
        resolvedMiddlewares,
      });
      return Match.value(item.functionVisibility).pipe(
        Match.when("public", () => Definition.PublicMutation(definition)),
        Match.when("internal", () => Definition.InternalMutation(definition)),
        Match.exhaustive,
      );
    }),
    Match.when("action", () => {
      const definition = convexActionFunction(databaseSchema, {
        name: item.name,
        functionVisibility: item.functionVisibility,
        args: item.args,
        returns: item.returns,
        error: item.error,
        handler: item.handler,
        resolvedMiddlewares,
      });
      return Match.value(item.functionVisibility).pipe(
        Match.when("public", () => Definition.PublicAction(definition)),
        Match.when("internal", () => Definition.InternalAction(definition)),
        Match.exhaustive,
      );
    }),
    Match.exhaustive,
  );

export const make = (
  databaseSchema: DatabaseSchema.AnyWithProps,
  item: FunctionRegistryItem.ConfectFunctionRegistryItem,
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware> = [],
): RegisteredFunction.Any =>
  register(prepare(databaseSchema, item, resolvedMiddlewares));

export const register = (self: Definition): RegisteredFunction.Any =>
  Definition.$match(self, {
    PublicQuery: (definition) =>
      queryGeneric(RegisteredFunction.toConvexDefinition(definition)),
    InternalQuery: (definition) =>
      internalQueryGeneric(RegisteredFunction.toConvexDefinition(definition)),
    PublicMutation: (definition) =>
      mutationGeneric(RegisteredFunction.toConvexDefinition(definition)),
    InternalMutation: (definition) =>
      internalMutationGeneric(
        RegisteredFunction.toConvexDefinition(definition),
      ),
    PublicAction: (definition) =>
      actionGeneric(RegisteredFunction.toConvexDefinition(definition)),
    InternalAction: (definition) =>
      internalActionGeneric(RegisteredFunction.toConvexDefinition(definition)),
    Registered: ({ handler }) => handler,
  });

/**
 * Convex evicts a query from its cache once the execution observes the current
 * time (every `Date.now()` read is tracked). Effect's logging, span, and
 * elapsed-time machinery reads timestamps through the ambient `Clock`'s unsafe
 * accessors, which would silently opt any logging or timing query out of the
 * cache—and there is no untracked time source in the isolate to serve them
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
  // oxlint-disable-next-line effecttsgo/global-date-in-effect -- This access intentionally notifies Convex's query-cache tracker.
  currentTimeMillis: Effect.sync(() => Date.now()),
  // oxlint-disable-next-line effecttsgo/global-date-in-effect -- This access intentionally notifies Convex's query-cache tracker.
  currentTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
  // oxlint-disable-next-line effecttsgo/global-date-in-effect -- This access intentionally notifies Convex's query-cache tracker.
  monotonicTimeNanos: Effect.sync(() => BigInt(Date.now()) * 1_000_000n),
  // `Effect.sleep` resolves the ambient clock, so it cannot be used here—it
  // would recurse straight back into this `sleep`.
  sleep: (duration) =>
    Effect.callback<void>((resume) => {
      // oxlint-disable-next-line effecttsgo/global-timers-in-effect -- Effect.sleep would resolve this Clock and recurse.
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
  name,
  functionVisibility,
  args,
  returns,
  error,
  handler,
  resolvedMiddlewares,
}: {
  databaseSchema: DatabaseSchema_;
  name: string;
  functionVisibility: FunctionVisibility;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (
    a: Args,
  ) => Effect.Effect<Returns, E, Handler.QueryServices<DatabaseSchema_>>;
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
}) => ({
  args: () => compileArgsSchema(args, databaseSchema.target.scope),
  returns: () => compileReturnsSchema(returns, databaseSchema.target.scope),
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
        Effect.catchTag("SchemaError", Effect.die),
      );
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Middleware errors are intentionally erased here and validated by runHandlerPromise against the combined error schema below.
      const decodedReturns = yield* RegisteredFunction.applyMiddleware(
        handler(decodedArgs),
        resolvedMiddlewares,
        {
          name,
          functionType: "query",
          functionVisibility,
          args: decodedArgs,
        },
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            DatabaseReader.layer(databaseSchema, ctx.db),
            DocumentIds.layer(databaseSchema, ctx.db),
            Auth.layerForTarget<DatabaseSchema_["target"]>(
              databaseSchema.target,
              ctx.auth,
            ),
            Storage.layer<DatabaseSchema.Scope<DatabaseSchema_>>(
              ctx.storage,
              databaseSchema.target.scope,
            ),
            ExecutionMetadata.layer(ctx.meta),
            TransactionMetadata.layer(ctx.meta),
            QueryTransactionContext.layer(ctx),
            QueryRunner.layer(ctx.runQuery),
            QueryCtx.layer<
              DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>,
              DatabaseSchema.Scope<DatabaseSchema_>
            >(ctx, databaseSchema.target.scope),
            ConvexConfigProvider.layer,
          ),
        ),
      );
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.catchTag("SchemaError", Effect.die),
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
    DocumentIds.layer(schema, ctx.db),
    DatabaseWriter.layer(schema, ctx.db),
    Auth.layerForTarget<Schema["target"]>(schema.target, ctx.auth),
    Scheduler.layer<DatabaseSchema.Scope<Schema>>(
      ctx.scheduler,
      schema.target.scope,
    ),
    Storage.layer<DatabaseSchema.Scope<Schema>>(
      ctx.storage,
      schema.target.scope,
    ),
    StorageWriter.layer<DatabaseSchema.Scope<Schema>>(
      ctx.storage,
      schema.target.scope,
    ),
    ExecutionMetadata.layer(ctx.meta),
    RequestMetadata.layer(ctx.meta),
    TransactionMetadata.layer(ctx.meta),
    QueryTransactionContext.layer(ctx),
    MutationTransactionContext.layer(ctx),
    QueryRunner.layer(ctx.runQuery),
    MutationRunner.layer(ctx.runMutation),
    MutationCtx.layer<
      DataModel.ToConvex<DataModel.FromSchema<Schema>>,
      DatabaseSchema.Scope<Schema>
    >(ctx, schema.target.scope),
    ConvexConfigProvider.layer,
  );

export type MutationServices<Schema extends DatabaseSchema.AnyWithProps> =
  Handler.MutationServices<Schema>;

const mutationFunction = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Args,
  ConvexArgs extends DefaultFunctionArgs,
  Returns,
  ConvexReturns,
  E,
>({
  databaseSchema,
  name,
  functionVisibility,
  args,
  returns,
  error,
  handler,
  resolvedMiddlewares,
}: {
  databaseSchema: DatabaseSchema_;
  name: string;
  functionVisibility: FunctionVisibility;
  args: Schema.Codec<Args, ConvexArgs>;
  returns: Schema.Codec<Returns, ConvexReturns>;
  error: Schema.Codec<Error, Value> | undefined;
  handler: (
    a: Args,
  ) => Effect.Effect<Returns, E, MutationServices<DatabaseSchema_>>;
  resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
}) => ({
  args: () => compileArgsSchema(args, databaseSchema.target.scope),
  returns: () => compileReturnsSchema(returns, databaseSchema.target.scope),
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
        Effect.catchTag("SchemaError", Effect.die),
      );
      // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Middleware errors are intentionally erased here and validated by runHandlerPromise against the combined error schema below.
      const decodedReturns = yield* RegisteredFunction.applyMiddleware(
        handler(decodedArgs),
        resolvedMiddlewares,
        {
          name,
          functionType: "mutation",
          functionVisibility,
          args: decodedArgs,
        },
      ).pipe(Effect.provide(mutationLayer(databaseSchema, ctx)));
      return yield* pipe(
        decodedReturns,
        Schema.encodeEffect(returns),
        Effect.catchTag("SchemaError", Effect.die),
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
    name,
    functionVisibility,
    args,
    returns,
    error,
    handler,
    resolvedMiddlewares,
  }: {
    name: string;
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
    resolvedMiddlewares: ReadonlyArray<ResolvedMiddleware.ResolvedMiddleware>;
  },
) =>
  RegisteredFunction.actionFunctionBase({
    scope: schema.target.scope,
    name,
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
