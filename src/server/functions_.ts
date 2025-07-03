import {
  type DefaultFunctionArgs,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
  actionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { Effect, Layer, Schema, pipe } from "effect";

import { ConfectActionCtx, makeConfectActionCtx } from "~/src/server/ctx";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "~/src/server/data-model";
import type {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "~/src/server/schema";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "~/src/server/schema-to-validator";
import { makeConfectDatabaseServices } from "~/src/server/database_";
import { ConfectAuth, ConvexAuth } from "~/src/server/auth_";
import { ConfectScheduler, ConvexScheduler } from "~/src/server/scheduler_";
import {
  ConfectStorageReader,
  ConfectStorageWriter,
  ConvexStorageReader,
  ConvexStorageWriter,
} from "./storage_";
import { ConfectQueryRunner, ConvexQueryRunner } from "./query_runner";

export const makeFunctions = <ConfectSchema extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
) => {
  type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

  const {
    ConfectDatabaseSchemaDefinitionLive,
    ConvexDatabaseReader,
    ConvexDatabaseReaderLive,
    ConfectDatabaseReader,
    ConfectDatabaseReaderLive,
    ConvexDatabaseWriter,
    ConvexDatabaseWriterLive,
    ConfectDatabaseWriter,
    ConfectDatabaseWriterLive,
  } = makeConfectDatabaseServices(confectSchemaDefinition);

  type ConvexDatabaseReader = typeof ConvexDatabaseReader.Service;
  type ConfectDatabaseReader = typeof ConfectDatabaseReader.Service;
  type ConvexDatabaseWriter = typeof ConvexDatabaseWriter.Service;
  type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Service;
  type ConfectAuth = typeof ConfectAuth.Service;
  type ConfectScheduler = typeof ConfectScheduler.Service;

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
      | ConvexDatabaseReader
      | ConfectDatabaseReader
      | ConvexAuth
      | ConfectAuth
      | ConvexStorageReader
      | ConfectStorageReader
      | ConvexQueryRunner
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
      | ConvexDatabaseReader
      | ConfectDatabaseReader
      | ConvexAuth
      | ConfectAuth
      | ConvexStorageReader
      | ConfectStorageReader
      | ConvexQueryRunner
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
      | ConvexDatabaseReader
      | ConfectDatabaseReader
      | ConvexAuth
      | ConfectAuth
      | ConvexStorageReader
      | ConfectStorageReader
      | ConvexQueryRunner
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
          handler(decodedArgs).pipe(
            Effect.provide(
              ConfectDatabaseReaderLive.pipe(
                Layer.provideMerge(ConvexDatabaseReaderLive(ctx.db)),
                Layer.provide(ConfectDatabaseSchemaDefinitionLive),
              ),
            ),
            Effect.provide(
              ConfectAuth.Default.pipe(
                Layer.provideMerge(Layer.succeed(ConvexAuth, ctx.auth)),
              ),
            ),
            Effect.provide(
              ConfectStorageReader.Default.pipe(
                Layer.provideMerge(
                  Layer.succeed(ConvexStorageReader, ctx.storage),
                ),
              ),
            ),
            Effect.provide(
              ConfectQueryRunner.Default.pipe(
                Layer.provideMerge(
                  Layer.succeed(ConvexQueryRunner, ctx.runQuery),
                ),
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
      | ConvexDatabaseReader
      | ConfectDatabaseReader
      | ConvexDatabaseWriter
      | ConfectDatabaseWriter
      | ConvexAuth
      | ConfectAuth
      | ConvexScheduler
      | ConfectScheduler
      | ConvexStorageReader
      | ConfectStorageReader
      | ConvexStorageWriter
      | ConfectStorageWriter
      | ConvexQueryRunner
      | ConfectQueryRunner
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
      | ConvexDatabaseReader
      | ConfectDatabaseReader
      | ConvexDatabaseWriter
      | ConfectDatabaseWriter
      | ConvexAuth
      | ConfectAuth
      | ConvexScheduler
      | ConfectScheduler
      | ConvexStorageReader
      | ConfectStorageReader
      | ConvexStorageWriter
      | ConfectStorageWriter
      | ConvexQueryRunner
      | ConfectQueryRunner
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
      | ConvexDatabaseReader
      | ConfectDatabaseReader
      | ConvexDatabaseWriter
      | ConfectDatabaseWriter
      | ConvexAuth
      | ConfectAuth
      | ConvexScheduler
      | ConfectScheduler
      | ConvexStorageReader
      | ConfectStorageReader
      | ConvexStorageWriter
      | ConfectStorageWriter
      | ConvexQueryRunner
      | ConfectQueryRunner
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
          handler(decodedArgs).pipe(
            Effect.provide(
              ConfectDatabaseWriterLive.pipe(
                Layer.provideMerge(ConvexDatabaseWriterLive(ctx.db)),
                Layer.provideMerge(
                  ConfectDatabaseReaderLive.pipe(
                    Layer.provideMerge(ConvexDatabaseReaderLive(ctx.db)),
                    Layer.provide(ConfectDatabaseSchemaDefinitionLive),
                  ),
                ),
                Layer.provide(ConfectDatabaseSchemaDefinitionLive),
              ),
            ),
            Effect.provide(
              ConfectAuth.Default.pipe(
                Layer.provideMerge(Layer.succeed(ConvexAuth, ctx.auth)),
              ),
            ),
            Effect.provide(
              ConfectScheduler.Default.pipe(
                Layer.provideMerge(
                  Layer.succeed(ConvexScheduler, ctx.scheduler),
                ),
              ),
            ),
            Effect.provide(
              ConfectStorageReader.Default.pipe(
                Layer.provideMerge(
                  Layer.succeed(ConvexStorageReader, ctx.storage),
                ),
              ),
            ),
            Effect.provide(
              ConfectStorageWriter.Default.pipe(
                Layer.provideMerge(
                  Layer.succeed(ConvexStorageWriter, ctx.storage),
                ),
              ),
            ),
            Effect.provide(
              ConfectQueryRunner.Default.pipe(
                Layer.provideMerge(
                  Layer.succeed(ConvexQueryRunner, ctx.runQuery),
                ),
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
      ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>
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
      ConfectActionCtx<ConfectDataModelFromConfectSchema<ConfectSchema>>
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
    ConvexDatabaseReader,
    ConfectDatabaseReader,
    ConvexDatabaseWriter,
    ConfectDatabaseWriter,
    ConvexAuth,
    ConfectAuth,
    ConvexScheduler,
    ConfectScheduler,
    ConvexStorageReader,
    ConfectStorageReader,
    ConvexStorageWriter,
    ConfectStorageWriter,
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
  ) => Effect.Effect<ConfectReturns, E, ConfectActionCtx<ConfectDataModel>>;
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
        handler(decodedArgs).pipe(
          Effect.provideService(
            ConfectActionCtx<ConfectDataModel>(),
            makeConfectActionCtx(ctx),
          ),
        ),
      ),
      Effect.andThen((convexReturns) =>
        Schema.encodeUnknown(returns)(convexReturns),
      ),
      Effect.runPromise,
    ),
});
