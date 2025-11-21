import {
  actionGeneric,
  type DefaultFunctionArgs,
  type FunctionVisibility,
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
import { Effect, Layer, Match, pipe, Predicate, Ref, Schema } from "effect";
import * as ConfectActionRunner from "../server/ConfectActionRunner";
import * as ConfectAuth from "../server/ConfectAuth";
import * as ConfectDatabaseReader from "../server/ConfectDatabaseReader";
import * as ConfectDatabaseWriter from "../server/ConfectDatabaseWriter";
import * as ConfectMutationRunner from "../server/ConfectMutationRunner";
import * as ConfectQueryRunner from "../server/ConfectQueryRunner";
import * as ConfectScheduler from "../server/ConfectScheduler";
import type {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "../server/ConfectSchema";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "../server/ConfectStorage";
import * as ConfectVectorSearch from "../server/ConfectVectorSearch";
import * as ConvexActionCtx from "../server/ConvexActionCtx";
import * as ConvexMutationCtx from "../server/ConvexMutationCtx";
import * as ConvexQueryCtx from "../server/ConvexQueryCtx";
import * as SchemaToValidator from "../server/SchemaToValidator";
import { mapLeaves } from "../utils";
import type * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiRegistry from "./ConfectApiRegistry";

export type RegisteredFunction =
  | RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any>;

const isRegisteredQuery = (
  u: unknown
): u is RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any> =>
  Predicate.hasProperty(u, "isQuery") && u.isQuery === true;

const isRegisteredMutation = (
  u: unknown
): u is RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any> =>
  Predicate.hasProperty(u, "isMutation") && u.isMutation === true;

const isRegisteredAction = (
  u: unknown
): u is RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any> =>
  Predicate.hasProperty(u, "isAction") && u.isAction === true;

export const isRegisteredFunction = (u: unknown): u is RegisteredFunction =>
  isRegisteredQuery(u) || isRegisteredMutation(u) || isRegisteredAction(u);

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiServer");
export type TypeId = typeof TypeId;

export const isConfectApiServer = (u: unknown): u is ConfectApiServer =>
  Predicate.hasProperty(u, TypeId);

export interface RegisteredFunctions {
  readonly [key: string]: RegisteredFunction | RegisteredFunctions;
}

export interface ConfectApiServer {
  readonly [TypeId]: TypeId;
  readonly registeredFunctions: RegisteredFunctions;
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = ({
  registeredFunctions,
}: {
  registeredFunctions: RegisteredFunctions;
}): ConfectApiServer =>
  Object.assign(Object.create(Proto), {
    registeredFunctions,
  });

export const make = Effect.gen(function* () {
  const { api } = yield* ConfectApiBuilder.ConfectApiService;
  const registry = yield* ConfectApiRegistry.ConfectApiRegistry;

  const handlerItems = yield* Ref.get(registry);

  const registeredFunctions = mapLeaves<
    ConfectApiBuilder.Handlers.Item.AnyWithProps,
    RegisteredFunction
  >(handlerItems, ConfectApiBuilder.isHandlerItem, (handlerItem) =>
    makeRegisteredFunction(api, handlerItem)
  );

  return makeProto({ registeredFunctions });
});

const makeRegisteredFunction = <Api extends ConfectApi.ConfectApi.AnyWithProps>(
  api: Api,
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
        confectActionFunction({
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
      | ConfectDatabaseReader.ConfectDatabaseReader<
          ConfectSchemaDefinition<ConfectSchema>
        >
      | ConfectAuth.ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner.ConfectQueryRunner
      | ConvexQueryCtx.ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
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
              ConfectDatabaseReader.layer(confectSchemaDefinition, ctx.db),
              ConfectAuth.layer(ctx.auth),
              ConfectStorageReader.layer(ctx.storage),
              ConfectQueryRunner.layer(ctx.runQuery),
              Layer.succeed(
                ConvexQueryCtx.ConvexQueryCtx<
                  DataModelFromConfectSchema<ConfectSchema>
                >(),
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
      | ConfectDatabaseReader.ConfectDatabaseReader<
          ConfectSchemaDefinition<ConfectSchema>
        >
      | ConfectDatabaseWriter.ConfectDatabaseWriter<
          ConfectSchemaDefinition<ConfectSchema>
        >
      | ConfectAuth.ConfectAuth
      | ConfectScheduler.ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner.ConfectQueryRunner
      | ConfectMutationRunner.ConfectMutationRunner
      | ConvexMutationCtx.ConvexMutationCtx<
          DataModelFromConfectSchema<ConfectSchema>
        >
    >;
  }
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
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
              ConfectDatabaseReader.layer(confectSchemaDefinition, ctx.db),
              ConfectDatabaseWriter.layer(confectSchemaDefinition, ctx.db),
              ConfectAuth.layer(ctx.auth),
              ConfectScheduler.layer(ctx.scheduler),
              ConfectStorageReader.layer(ctx.storage),
              ConfectStorageWriter.layer(ctx.storage),
              ConfectQueryRunner.layer(ctx.runQuery),
              ConfectMutationRunner.layer(ctx.runMutation),
              Layer.succeed(
                ConvexMutationCtx.ConvexMutationCtx<
                  DataModelFromConfectSchema<ConfectSchema>
                >(),
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
>({
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
    | ConfectScheduler.ConfectScheduler
    | ConfectAuth.ConfectAuth
    | ConfectStorageReader
    | ConfectStorageWriter
    | ConfectStorageActionWriter
    | ConfectQueryRunner.ConfectQueryRunner
    | ConfectMutationRunner.ConfectMutationRunner
    | ConfectActionRunner.ConfectActionRunner
    | ConfectVectorSearch.ConfectVectorSearch
    | ConvexActionCtx.ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>
  >;
}) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
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
              ConfectQueryRunner.layer(ctx.runQuery),
              ConfectMutationRunner.layer(ctx.runMutation),
              ConfectActionRunner.layer(ctx.runAction),
              ConfectVectorSearch.layer(ctx.vectorSearch),
              Layer.succeed(
                ConvexActionCtx.ConvexActionCtx<
                  DataModelFromConfectSchema<ConfectSchema>
                >(),
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
