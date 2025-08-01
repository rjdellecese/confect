import {
  actionGeneric,
  type DefaultFunctionArgs,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import { Effect, Layer, pipe, Schema } from "effect";

import { ConfectAuth } from "~/src/server/auth";
import type { DataModelFromConfectDataModel } from "~/src/server/data_model";
import { makeConfectDatabaseServices } from "~/src/server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "~/src/server/runners";
import { ConfectScheduler } from "~/src/server/scheduler";
import type {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "~/src/server/schema";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "~/src/server/schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "~/src/server/storage";
import { ConfectVectorSearch } from "~/src/server/vector_search";
import { ConvexActionCtx, ConvexMutationCtx, ConvexQueryCtx } from "./ctx";

export const makeConfectFunctions = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
) => {
  type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

  const { ConfectDatabaseReader, ConfectDatabaseWriter } =
    makeConfectDatabaseServices(confectSchemaDefinition);

  type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;
  type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

  type ConfectVectorSearch = typeof ConfectVectorSearch.Identifier;

  type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

  const QueryCtx = ConvexQueryCtx<DataModel>();
  type QueryCtx = typeof QueryCtx.Service;
  const MutationCtx = ConvexMutationCtx<DataModel>();
  type MutationCtx = typeof MutationCtx.Service;
  const ActionCtx = ConvexActionCtx<DataModel>();
  type ActionCtx = typeof ActionCtx.Service;

  const confectQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | QueryCtx
    >;
  }): RegisteredQuery<"public", ConvexArgs, Promise<ConvexReturns>> =>
    queryGeneric(confectQueryFunction({ args, returns, handler }));

  const confectInternalQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    handler,
    returns,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | QueryCtx
    >;
  }): RegisteredQuery<"internal", ConvexArgs, Promise<ConvexReturns>> =>
    internalQueryGeneric(confectQueryFunction({ args, returns, handler }));

  const confectQueryFunction = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | QueryCtx
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericQueryCtx<DataModel>,
      actualArgs: ConvexArgs,
    ): Promise<ConvexReturns> =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) =>
          pipe(
            handler(decodedArgs),
            Effect.provide(
              Layer.mergeAll(
                ConfectDatabaseReader.layer(ctx.db),
                ConfectAuth.layer(ctx.auth),
                ConfectStorageReader.layer(ctx.storage),
                ConfectQueryRunner.layer(ctx.runQuery),
                Layer.succeed(QueryCtx, ctx),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.runPromise,
      ),
  });

  const confectMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader
      | ConfectDatabaseWriter
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | MutationCtx
    >;
  }): RegisteredMutation<"public", ConvexValue, Promise<ConvexReturns>> =>
    mutationGeneric(confectMutationFunction({ args, returns, handler }));

  const confectInternalMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader
      | ConfectDatabaseWriter
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | MutationCtx
    >;
  }): RegisteredMutation<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalMutationGeneric(
      confectMutationFunction({ args, returns, handler }),
    );

  const confectMutationFunction = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader
      | ConfectDatabaseWriter
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | MutationCtx
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericMutationCtx<DataModel>,
      actualArgs: ConvexArgs,
    ): Promise<ConvexReturns> =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) =>
          pipe(
            handler(decodedArgs),
            Effect.provide(
              Layer.mergeAll(
                ConfectDatabaseReader.layer(ctx.db),
                ConfectDatabaseWriter.layer(ctx.db),
                ConfectAuth.layer(ctx.auth),
                ConfectScheduler.layer(ctx.scheduler),
                ConfectStorageReader.layer(ctx.storage),
                ConfectStorageWriter.layer(ctx.storage),
                ConfectQueryRunner.layer(ctx.runQuery),
                ConfectMutationRunner.layer(ctx.runMutation),
                Layer.succeed(MutationCtx, ctx),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.runPromise,
      ),
  });

  const confectAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
      | ActionCtx
    >;
  }): RegisteredAction<"public", ConvexValue, Promise<ConvexReturns>> =>
    actionGeneric(confectActionFunction({ args, returns, handler }));

  const confectInternalAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
      | ActionCtx
    >;
  }): RegisteredAction<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalActionGeneric(confectActionFunction({ args, returns, handler }));

  const confectActionFunction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
      | ActionCtx
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericActionCtx<DataModel>,
      actualArgs: ConvexValue,
    ): Promise<ConvexReturns> =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) =>
          pipe(
            handler(decodedArgs),
            Effect.provide(
              Layer.mergeAll(
                ConfectScheduler.layer(ctx.scheduler),
                ConfectAuth.layer(ctx.auth),
                ConfectStorageReader.layer(ctx.storage),
                ConfectStorageWriter.layer(ctx.storage),
                ConfectStorageActionWriter.layer(ctx.storage),
                ConfectQueryRunner.layer(ctx.runQuery),
                ConfectMutationRunner.layer(ctx.runMutation),
                ConfectActionRunner.layer(ctx.runAction),
                ConfectVectorSearch.layer(ctx.vectorSearch),
                Layer.succeed(ActionCtx, ctx),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.runPromise,
      ),
  });

  return {
    confectQuery,
    confectInternalQuery,
    confectMutation,
    confectInternalMutation,
    confectAction,
    confectInternalAction,
    ConfectDatabaseReader,
    ConfectDatabaseWriter,
    ConfectVectorSearch,
  };
};
