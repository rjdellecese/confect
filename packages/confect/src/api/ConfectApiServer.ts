import { GenericQueryCtx, queryGeneric, RegisteredQuery } from "convex/server";
import {
  Array,
  Effect,
  hole,
  Layer,
  pipe,
  Record,
  Runtime,
  Schema,
  Struct,
  Types,
} from "effect";
import { ConvexQueryCtx } from "../server";
import { ConfectAuth } from "../server/auth";
import { confectDatabaseReaderLayer } from "../server/database";
import { confectQueryRunnerLayer } from "../server/runners";
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "../server/schema";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "../server/schema_to_validator";
import { ConfectStorageReader } from "../server/storage";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiServer");

export type TypeId = typeof TypeId;

export type ConfectApiServer<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
> = Types.Simplify<
  {
    readonly [TypeId]: TypeId;
    readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
    readonly apiName: ApiName;
  } & {
    readonly functions: {
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
    };
  }
>;

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
): ConfectApiServer<ConfectSchema, ApiName, Groups> =>
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

        const groupNames = Struct.keys(apiWithDatabaseSchema.api.groups);

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
                      function_,
                      handler,
                    }): [
                      string,
                      RegisteredQuery<
                        "public",
                        (typeof function_.args)["Encoded"],
                        (typeof function_.returns)["Encoded"]
                      >,
                    ] => {
                      const name = function_.name;

                      const argsValidator = compileArgsSchema(function_.args);
                      const returnsValidator = compileReturnsSchema(
                        function_.returns
                      );
                      const convexHandler = (
                        ctx: GenericQueryCtx<
                          DataModelFromConfectSchema<ConfectSchema>
                        >,
                        encodedArgs: (typeof function_.args)["Encoded"]
                      ) =>
                        Effect.gen(function* () {
                          const decodedArgs = yield* Schema.decode(
                            function_.args
                          )(encodedArgs);

                          const decodedReturns = yield* handler(decodedArgs);
                          const encodedReturns = yield* Schema.encode(
                            function_.returns
                          )(decodedReturns);

                          return encodedReturns;
                        }).pipe(
                          Effect.provide(
                            Layer.mergeAll(
                              confectDatabaseReaderLayer(
                                apiWithDatabaseSchema.confectSchemaDefinition,
                                ctx.db
                              ),
                              ConfectAuth.layer(ctx.auth),
                              ConfectStorageReader.layer(ctx.storage),
                              confectQueryRunnerLayer(ctx.runQuery),
                              Layer.succeed(
                                ConvexQueryCtx<
                                  DataModelFromConfectSchema<ConfectSchema>
                                >(),
                                ctx
                              )
                            )
                          ),
                          Effect.runPromise
                        );

                      const registeredFunction = queryGeneric({
                        args: argsValidator,
                        returns: returnsValidator,
                        handler: convexHandler,
                      });

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
