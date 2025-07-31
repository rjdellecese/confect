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
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "~/src/server/data-model";
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

export const makeFunctions = <ConfectSchema extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
) => {
  type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

  const { ConfectDatabaseReader, ConfectDatabaseWriter } =
    makeConfectDatabaseServices(confectSchemaDefinition);

  type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;
  type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

  type ConfectVectorSearch = typeof ConfectVectorSearch.Identifier;

  const query = <
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
    >;
  }): RegisteredQuery<"public", ConvexArgs, Promise<ConvexReturns>> =>
    queryGeneric(confectQueryFunction({ args, returns, handler }));

  const internalQuery = <
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
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericQueryCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
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

  const mutation = <
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
    >;
  }): RegisteredMutation<"public", ConvexValue, Promise<ConvexReturns>> =>
    mutationGeneric(confectMutationFunction({ args, returns, handler }));

  const internalMutation = <
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
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericMutationCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
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

  const action = <
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
    >;
  }): RegisteredAction<"public", ConvexValue, Promise<ConvexReturns>> =>
    actionGeneric(confectActionFunction({ args, returns, handler }));

  const internalAction = <
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
    >;
  }): RegisteredAction<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalActionGeneric(confectActionFunction({ args, returns, handler }));

  return {
    query,
    internalQuery,
    mutation,
    internalMutation,
    action,
    internalAction,
    ConfectDatabaseReader,
    ConfectDatabaseWriter,
    ConfectVectorSearch,
  };
};

const confectActionFunction = <
  ConfectDataModel extends GenericConfectDataModel,
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
  >;
}) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
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
