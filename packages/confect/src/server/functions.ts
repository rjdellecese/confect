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
import { ConvexError } from "convex/values";
import { Effect, Layer, pipe, Schema } from "effect";

import { ConfectAuth } from "./auth";
import { ConvexActionCtx, ConvexMutationCtx, ConvexQueryCtx } from "./ctx";
import type { DataModelFromConfectDataModel } from "./data_model";
import {
  ConfectDatabaseReader as ConfectDatabaseReaderTag,
  ConfectDatabaseWriter as ConfectDatabaseWriterTag,
  confectDatabaseReaderLayer,
  confectDatabaseWriterLayer,
} from "./database";
import {
  type ConfectActionRunner,
  type ConfectMutationRunner,
  type ConfectQueryRunner,
  confectActionRunnerLayer,
  confectMutationRunnerLayer,
  confectQueryRunnerLayer,
} from "./runners";
import { ConfectScheduler } from "./scheduler";
import type {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "./schema";
import { compileArgsSchema, compileReturnsSchema } from "./schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./storage";
import {
  type ConfectVectorSearch,
  confectVectorSearchLayer,
} from "./vector_search";

/**
 * Utility function to handle Effect errors and convert them to ConvexError
 * This ensures that Effect errors are properly serialized and can be caught by the frontend
 */
const handleEffectError = (error: unknown): never => {
  // Check if it's a tagged error from Effect Schema
  if (error && typeof error === "object" && "_tag" in error) {
    const taggedError = error as { _tag: string; message?: string };

    // Create ConvexError with the tagged error data
    const convexErrorData = {
      _tag: taggedError._tag,
      message: taggedError.message || "Unknown error",
    };
    throw new ConvexError(convexErrorData);
  }

  // For non-tagged errors, wrap them as generic errors
  throw new ConvexError({
    _tag: "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error occurred",
  });
};

export const makeConfectFunctions = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
) => {
  type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

  const ConfectDatabaseReader =
    ConfectDatabaseReaderTag<ConfectSchemaDefinition<ConfectSchema>>();
  const ConfectDatabaseWriter =
    ConfectDatabaseWriterTag<ConfectSchemaDefinition<ConfectSchema>>();
  type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;
  type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

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
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    errors,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | QueryCtx
    >;
  }): RegisteredQuery<"public", ConvexArgs, Promise<ConvexReturns>> => {
    const queryFunction = queryGeneric(
      confectQueryFunction({ args, returns, errors, handler }),
    );

    // Add metadata for frontend access without affecting the type
    (queryFunction as any)._confectMeta = {
      args,
      returns,
      type: "query" as const,
    };

    return queryFunction;
  };

  const confectInternalQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    handler,
    returns,
    errors,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | QueryCtx
    >;
  }): RegisteredQuery<"internal", ConvexArgs, Promise<ConvexReturns>> =>
    internalQueryGeneric(
      confectQueryFunction({ args, returns, errors, handler }),
    );

  const confectQueryFunction = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
                confectDatabaseReaderLayer(confectSchemaDefinition, ctx.db),
                ConfectAuth.layer(ctx.auth),
                ConfectStorageReader.layer(ctx.storage),
                confectQueryRunnerLayer(ctx.runQuery),
                Layer.succeed(QueryCtx, ctx),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.catchAll((error) => Effect.sync(() => handleEffectError(error))),
        Effect.runPromise,
      ),
  });

  const confectMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    errors,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
  }): RegisteredMutation<"public", ConvexValue, Promise<ConvexReturns>> => {
    const mutationFunction = mutationGeneric(
      confectMutationFunction({ args, returns, errors, handler }),
    );

    // Add metadata for frontend access without affecting the type
    (mutationFunction as any)._confectMeta = {
      args,
      returns,
      type: "mutation" as const,
    };

    return mutationFunction;
  };

  const confectInternalMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    errors,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
      confectMutationFunction({ args, returns, errors, handler }),
    );

  const confectMutationFunction = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectArgs,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
                confectDatabaseReaderLayer(confectSchemaDefinition, ctx.db),
                confectDatabaseWriterLayer(confectSchemaDefinition, ctx.db),
                ConfectAuth.layer(ctx.auth),
                ConfectScheduler.layer(ctx.scheduler),
                ConfectStorageReader.layer(ctx.storage),
                ConfectStorageWriter.layer(ctx.storage),
                confectQueryRunnerLayer(ctx.runQuery),
                confectMutationRunnerLayer(ctx.runMutation),
                Layer.succeed(MutationCtx, ctx),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.catchAll((error) => Effect.sync(() => handleEffectError(error))),
        Effect.runPromise,
      ),
  });

  const confectAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    errors,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
  }): RegisteredAction<"public", ConvexValue, Promise<ConvexReturns>> => {
    const actionFunction = actionGeneric(
      confectActionFunction({ args, returns, errors, handler }),
    );

    // Add metadata for frontend access without affecting the type
    (actionFunction as any)._confectMeta = {
      args,
      returns,
      type: "action" as const,
    };

    return actionFunction;
  };

  const confectInternalAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    errors,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
    internalActionGeneric(
      confectActionFunction({ args, returns, errors, handler }),
    );

  const confectActionFunction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    Errors extends
      | Schema.Schema<any>
      | typeof Schema.Never
      | undefined = undefined,
  >({
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    errors?: Errors;
    handler: (
      a: ConfectValue,
    ) => Effect.Effect<
      ConfectReturns,
      Errors extends Schema.Schema<any>
        ? Schema.Schema.Type<Errors>
        : Errors extends typeof Schema.Never
          ? never
          : never,
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
                confectQueryRunnerLayer(ctx.runQuery),
                confectMutationRunnerLayer(ctx.runMutation),
                confectActionRunnerLayer(ctx.runAction),
                confectVectorSearchLayer(ctx.vectorSearch),
                Layer.succeed(ActionCtx, ctx),
              ),
            ),
          ),
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns),
        ),
        Effect.catchAll((error) => Effect.sync(() => handleEffectError(error))),
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
  };
};
