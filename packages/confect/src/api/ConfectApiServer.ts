import {
  actionGeneric,
  DefaultFunctionArgs,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
  RegisteredQuery,
} from "convex/server";
import {
  Array,
  Effect,
  hole,
  Layer,
  Match,
  pipe,
  Record,
  Runtime,
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
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiServer");

export type TypeId = typeof TypeId;

export type ConfectApiServer<
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
> = Types.Simplify<
  {
    readonly [TypeId]: TypeId;
  } & {
    readonly [GroupName in Groups["name"]]: {
      [FunctionName in keyof Extract<
        Groups,
        { name: GroupName }
      >["functions"]]: RegisteredQuery<
        "public",
        Extract<
          Groups,
          { name: GroupName }
        >["functions"][FunctionName]["args"]["Encoded"],
        Extract<
          Groups,
          { name: GroupName }
        >["functions"][FunctionName]["returns"]["Encoded"]
      >;
    };
  }
>;

export declare namespace ConfectApiServer {
}

export const make = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >,
  apiServiceLayer: Layer.Layer<
    ConfectApiBuilder.ConfectApiService<ConfectSchema, ApiName, Groups>
  >
): ConfectApiServer<Groups> =>
  Effect.gen(function* () {
    const layerRuntime = yield* Layer.toRuntime(apiServiceLayer);

    return Runtime.runSync(
      layerRuntime,
      Effect.gen(function* () {
        const api = yield* ConfectApiBuilder.ConfectApiService(
          apiWithDatabaseSchema.confectSchemaDefinition,
          apiWithDatabaseSchema.api.name,
          apiWithDatabaseSchema.api.groups
        );

        // TODO
        const a = Record.map(
          apiWithDatabaseSchema.api.groups as Record.ReadonlyRecord<
            Groups["name"],
            Groups
          >,
          (group) =>
            Effect.runSync(
              Effect.gen(function* () {
                const groupHandler = yield* api.groupHandler(group.name);

                return pipe(
                  groupHandler.handlers,
                  Array.map(
                    ({
                      function_: { functionType, name, args, returns },
                      handler,
                    }) => {
                      const registeredFunction = Match.value(functionType).pipe(
                        Match.when("Query", () =>
                          queryGeneric(
                            confectQueryFunction(
                              apiWithDatabaseSchema.confectSchemaDefinition,
                              {
                                args,
                                returns,
                                handler,
                              }
                            )
                          )
                        ),
                        Match.when("Mutation", () =>
                          mutationGeneric(
                            confectMutationFunction(
                              apiWithDatabaseSchema.confectSchemaDefinition,
                              {
                                args,
                                returns,
                                handler,
                              }
                            )
                          )
                        ),
                        Match.when("Action", () =>
                          actionGeneric(
                            confectActionFunction(
                              apiWithDatabaseSchema.confectSchemaDefinition,
                              {
                                args,
                                returns,
                                handler,
                              }
                            )
                          )
                        ),
                        Match.exhaustive
                      );

                      return [name, registeredFunction] as const;
                    }
                  ),
                  Record.fromEntries
                );
              })
            )
        );

        return hole<any>();
      })
    );
  }).pipe(Effect.scoped, Effect.runSync);

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
