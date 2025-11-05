import {
  actionGeneric,
  DefaultFunctionArgs,
  FunctionVisibility,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import {
  Effect,
  HashMap,
  Layer,
  Match,
  pipe,
  Predicate,
  Schema,
  Types,
} from "effect";
import {
  ConfectScheduler,
  ConfectVectorSearch,
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../server";
import { ConfectAuth } from "../server/auth";
import {
  ConfectDatabaseReader,
  confectDatabaseReaderLayer,
  ConfectDatabaseWriter,
  confectDatabaseWriterLayer,
} from "../server/database";
import {
  ConfectActionRunner,
  confectActionRunnerLayer,
  ConfectMutationRunner,
  confectMutationRunnerLayer,
  ConfectQueryRunner,
  confectQueryRunnerLayer,
} from "../server/runners";
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "../server/schema";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "../server/schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "../server/storage";
import { confectVectorSearchLayer } from "../server/vector_search";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiRegistry from "./ConfectApiRegistry";

type RegisteredFunction =
  | RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any>;

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiServer");

export type TypeId = typeof TypeId;

export const isConfectApiServer = (u: unknown): u is ConfectApiServer =>
  Predicate.hasProperty(u, TypeId);

// TODO: Recurse.
export type ConfectApiServer = Types.Simplify<{
  readonly [TypeId]: TypeId;
  readonly convexApi: HashMap.HashMap<string, RegisteredFunction>;
}>;

const Proto = {
  [TypeId]: TypeId,
};

const make_ = ({
  convexApi,
}: {
  convexApi: HashMap.HashMap<string, RegisteredFunction>;
}): ConfectApiServer =>
  Object.assign(Object.create(Proto), {
    convexApi,
  });

export const make = (
  apiServiceLayer: Layer.Layer<ConfectApiBuilder.ConfectApiService>
): Effect.Effect<ConfectApiServer> =>
  Effect.gen(function* () {
    const { api } = yield* ConfectApiBuilder.ConfectApiService;
    const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

    const registeredFunctions = yield* registry.registeredFunctions;

    const convexApi = HashMap.map(registeredFunctions, (handlerItem) =>
      makeRegisteredFunction(api, handlerItem)
    );

    const server = make_({
      convexApi,
    });

    return yield* Effect.succeed(server);
  }).pipe(
    Effect.provide(
      apiServiceLayer.pipe(
        Layer.provideMerge(ConfectApiRegistry.ConfectApiRegistry.Default)
      )
    )
  );

const makeRegisteredFunction = <
  ConfectApi extends ConfectApi.ConfectApi.AnyWithProps,
>(
  api: ConfectApi,
  { function_, handler }: ConfectApiBuilder.Handlers.Item.AnyWithProps
): RegisteredFunction =>
  Match.value(function_.functionType).pipe(
    Match.when("Query", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => queryGeneric),
        Match.when("Internal", () => internalQueryGeneric),
        Match.exhaustive
      );

      return genericFunction(
        confectQueryFunction(api.confectSchemaDefinition, {
          args: function_.args,
          returns: function_.returns,
          handler,
        })
      );
    }),
    Match.when("Mutation", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => mutationGeneric),
        Match.when("Internal", () => internalMutationGeneric),
        Match.exhaustive
      );

      return genericFunction(
        confectMutationFunction(api.confectSchemaDefinition, {
          args: function_.args,
          returns: function_.returns,
          handler,
        })
      );
    }),
    Match.when("Action", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => actionGeneric),
        Match.when("Internal", () => internalActionGeneric),
        Match.exhaustive
      );

      return genericFunction(
        confectActionFunction(api.confectSchemaDefinition, {
          args: function_.args,
          returns: function_.returns,
          handler,
        })
      );
    }),
    Match.exhaustive
  );

const confectQueryFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericQueryCtx<DataModelFromConfectSchema<ConfectSchema>>,
    actualArgs: ConvexArgs
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
              Layer.succeed(
                ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>(),
                ctx
              )
            )
          )
        )
      ),
      Effect.andThen((convexReturns) =>
        Schema.encodeUnknown(returns)(convexReturns)
      ),
      Effect.runPromise
    ),
});

const confectMutationFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
      | ConfectDatabaseWriter<ConfectSchemaDefinition<ConfectSchema>>
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConvexMutationCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericMutationCtx<DataModelFromConfectSchema<ConfectSchema>>,
    actualArgs: ConvexArgs
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
              Layer.succeed(
                ConvexMutationCtx<DataModelFromConfectSchema<ConfectSchema>>(),
                ctx
              )
            )
          )
        )
      ),
      Effect.andThen((convexReturns) =>
        Schema.encodeUnknown(returns)(convexReturns)
      ),
      Effect.runPromise
    ),
});

const confectActionFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexValue extends DefaultFunctionArgs,
  ConfectValue,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue
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
      | ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<DataModelFromConfectSchema<ConfectSchema>>,
    actualArgs: ConvexValue
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
              Layer.succeed(
                ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>(),
                ctx
              )
            )
          )
        )
      ),
      Effect.andThen((convexReturns) =>
        Schema.encodeUnknown(returns)(convexReturns)
      ),
      Effect.runPromise
    ),
});
