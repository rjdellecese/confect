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
import {
  type Types,
  Effect,
  Layer,
  Match,
  pipe,
  Predicate,
  Ref,
  Schema,
} from "effect";
import { mapLeaves } from "../internal/utils";
import * as ConfectActionRunner from "./ConfectActionRunner";
import type * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiRegistry from "./ConfectApiRegistry";
import * as ConfectAuth from "./ConfectAuth";
import * as ConfectDatabaseReader from "./ConfectDatabaseReader";
import * as ConfectDatabaseWriter from "./ConfectDatabaseWriter";
import type * as ConfectDataModel from "./ConfectDataModel";
import * as ConfectMutationRunner from "./ConfectMutationRunner";
import * as ConfectQueryRunner from "./ConfectQueryRunner";
import * as ConfectScheduler from "./ConfectScheduler";
import type * as ConfectSchema from "./ConfectSchema";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./ConfectStorage";
import * as ConfectVectorSearch from "./ConfectVectorSearch";
import * as ConvexActionCtx from "./ConvexActionCtx";
import * as ConvexMutationCtx from "./ConvexMutationCtx";
import * as ConvexQueryCtx from "./ConvexQueryCtx";
import * as SchemaToValidator from "./SchemaToValidator";
import type * as ConfectApiGroup from "../api/ConfectApiGroup";
import type * as ConfectApiSpec from "../api/ConfectApiSpec";
import type * as ConfectApiFunction from "../api/ConfectApiFunction";

export type RegisteredFunction =
  | RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any>
  | RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any>;

const isRegisteredQuery = (
  u: unknown,
): u is RegisteredQuery<FunctionVisibility, DefaultFunctionArgs, any> =>
  Predicate.hasProperty(u, "isQuery") && u.isQuery === true;

const isRegisteredMutation = (
  u: unknown,
): u is RegisteredMutation<FunctionVisibility, DefaultFunctionArgs, any> =>
  Predicate.hasProperty(u, "isMutation") && u.isMutation === true;

const isRegisteredAction = (
  u: unknown,
): u is RegisteredAction<FunctionVisibility, DefaultFunctionArgs, any> =>
  Predicate.hasProperty(u, "isAction") && u.isAction === true;

export const isRegisteredFunction = (u: unknown): u is RegisteredFunction =>
  isRegisteredQuery(u) || isRegisteredMutation(u) || isRegisteredAction(u);

export const TypeId = "@rjdellecese/confect/server/ConfectApiServer";
export type TypeId = typeof TypeId;

export const isConfectApiServer = (u: unknown): u is ConfectApiServer =>
  Predicate.hasProperty(u, TypeId);

export interface RegisteredFunctions {
  readonly [key: string]:
    | (RegisteredFunction & RegisteredFunctions)
    | RegisteredFunctions;
}

export interface ConfectApiServer<
  Api extends
    ConfectApi.ConfectApi.AnyWithProps = ConfectApi.ConfectApi.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly registeredFunctions: ServerApi<Api["spec"]>;
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <Api extends ConfectApi.ConfectApi.AnyWithProps>({
  registeredFunctions,
}: {
  registeredFunctions: RegisteredFunctions;
}): ConfectApiServer<Api> =>
  Object.assign(Object.create(Proto), {
    registeredFunctions,
  });

export const make = <Api extends ConfectApi.ConfectApi.AnyWithProps>(
  api: Api,
) =>
  Effect.gen(function* () {
    const registry = yield* ConfectApiRegistry.ConfectApiRegistry;
    const handlerItems = yield* Ref.get(registry);

    const registeredFunctions = mapLeaves<
      ConfectApiBuilder.Handlers.Item.AnyWithProps,
      RegisteredFunction
    >(handlerItems, ConfectApiBuilder.isHandlerItem, (handlerItem) =>
      makeRegisteredFunction(api, handlerItem),
    ) as RegisteredFunctions;

    return makeProto<Api>({ registeredFunctions });
  });

const makeRegisteredFunction = <Api extends ConfectApi.ConfectApi.AnyWithProps>(
  api: Api,
  { function_, handler }: ConfectApiBuilder.Handlers.Item.AnyWithProps,
): RegisteredFunction =>
  Match.value(function_.functionType).pipe(
    Match.when("Query", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => queryGeneric),
        Match.when("Internal", () => internalQueryGeneric),
        Match.exhaustive,
      );

      return genericFunction(
        confectQueryFunction(api.confectSchema, {
          args: function_.args,
          returns: function_.returns,
          handler,
        }),
      );
    }),
    Match.when("Mutation", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => mutationGeneric),
        Match.when("Internal", () => internalMutationGeneric),
        Match.exhaustive,
      );

      return genericFunction(
        confectMutationFunction(api.confectSchema, {
          args: function_.args,
          returns: function_.returns,
          handler,
        }),
      );
    }),
    Match.when("Action", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => actionGeneric),
        Match.when("Internal", () => internalActionGeneric),
        Match.exhaustive,
      );

      return genericFunction(
        confectActionFunction({
          args: function_.args,
          returns: function_.returns,
          handler,
        }),
      );
    }),
    Match.exhaustive,
  );

const confectQueryFunction = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  schema: ConfectSchema_,
  {
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
      | ConfectDatabaseReader.ConfectDatabaseReader<ConfectSchema_>
      | ConfectAuth.ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner.ConfectQueryRunner
      | ConvexQueryCtx.ConvexQueryCtx<
          ConfectDataModel.ConfectDataModel.DataModel<
            ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
          >
        >
    >;
  },
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericQueryCtx<
      ConfectDataModel.ConfectDataModel.DataModel<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    >,
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
              ConfectDatabaseReader.layer(schema, ctx.db),
              ConfectAuth.layer(ctx.auth),
              ConfectStorageReader.layer(ctx.storage),
              ConfectQueryRunner.layer(ctx.runQuery),
              Layer.succeed(
                ConvexQueryCtx.ConvexQueryCtx<
                  ConfectDataModel.ConfectDataModel.DataModel<
                    ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
                  >
                >(),
                ctx,
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

const confectMutationFunction = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  schema: ConfectSchema_,
  {
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
      | ConfectDatabaseReader.ConfectDatabaseReader<ConfectSchema_>
      | ConfectDatabaseWriter.ConfectDatabaseWriter<ConfectSchema_>
      | ConfectAuth.ConfectAuth
      | ConfectScheduler.ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner.ConfectQueryRunner
      | ConfectMutationRunner.ConfectMutationRunner
      | ConvexMutationCtx.ConvexMutationCtx<
          ConfectDataModel.ConfectDataModel.DataModel<
            ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
          >
        >
    >;
  },
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericMutationCtx<
      ConfectDataModel.ConfectDataModel.DataModel<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    >,
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
              ConfectDatabaseReader.layer(schema, ctx.db),
              ConfectDatabaseWriter.layer(schema, ctx.db),
              ConfectAuth.layer(ctx.auth),
              ConfectScheduler.layer(ctx.scheduler),
              ConfectStorageReader.layer(ctx.storage),
              ConfectStorageWriter.layer(ctx.storage),
              ConfectQueryRunner.layer(ctx.runQuery),
              ConfectMutationRunner.layer(ctx.runMutation),
              Layer.succeed(
                ConvexMutationCtx.ConvexMutationCtx<
                  ConfectDataModel.ConfectDataModel.DataModel<
                    ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
                  >
                >(),
                ctx,
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

const confectActionFunction = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
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
    | ConfectScheduler.ConfectScheduler
    | ConfectAuth.ConfectAuth
    | ConfectStorageReader
    | ConfectStorageWriter
    | ConfectStorageActionWriter
    | ConfectQueryRunner.ConfectQueryRunner
    | ConfectMutationRunner.ConfectMutationRunner
    | ConfectActionRunner.ConfectActionRunner
    | ConfectVectorSearch.ConfectVectorSearch<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    | ConvexActionCtx.ConvexActionCtx<
        ConfectDataModel.ConfectDataModel.DataModel<
          ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
        >
      >
  >;
}) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<
      ConfectDataModel.ConfectDataModel.DataModel<
        ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
      >
    >,
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
              Layer.succeed(
                ConvexActionCtx.ConvexActionCtx<
                  ConfectDataModel.ConfectDataModel.DataModel<
                    ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
                  >
                >(),
                ctx,
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

export type ServerApi<Spec extends ConfectApiSpec.ConfectApiSpec.AnyWithProps> =
  Types.Simplify<Helper<ConfectApiSpec.ConfectApiSpec.Groups<Spec>>>;

type Helper<Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps> = {
  [GroupName in ConfectApiGroup.ConfectApiGroup.Name<Groups>]: ConfectApiGroup.ConfectApiGroup.WithName<
    Groups,
    GroupName
  > extends infer Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
    ? ConfectApiGroup.ConfectApiGroup.Groups<Group> extends infer SubGroups extends
        ConfectApiGroup.ConfectApiGroup.AnyWithProps
      ? Types.Simplify<
          Helper<SubGroups> & {
            [FunctionName in ConfectApiFunction.ConfectApiFunction.Name<
              ConfectApiGroup.ConfectApiGroup.Functions<Group>
            >]: ConfectApiFunction.ConfectApiFunction.WithName<
              ConfectApiGroup.ConfectApiGroup.Functions<Group>,
              FunctionName
            > extends infer Function extends
              ConfectApiFunction.ConfectApiFunction.AnyWithProps
              ? RegisteredFunctionFromConfectFunction<Function>
              : never;
          }
        >
      : {
          [FunctionName in ConfectApiFunction.ConfectApiFunction.Name<
            ConfectApiGroup.ConfectApiGroup.Functions<Group>
          >]: ConfectApiFunction.ConfectApiFunction.WithName<
            ConfectApiGroup.ConfectApiGroup.Functions<Group>,
            FunctionName
          > extends infer Function extends
            ConfectApiFunction.ConfectApiFunction.AnyWithProps
            ? RegisteredFunctionFromConfectFunction<Function>
            : never;
        }
    : never;
};

type RegisteredFunctionFromConfectFunction<
  Function extends ConfectApiFunction.ConfectApiFunction.AnyWithProps,
> = Function["functionType"] extends "Query"
  ? RegisteredQuery<
      Lowercase<Function["functionVisibility"]>,
      Function["args"]["Encoded"],
      Promise<Function["returns"]["Encoded"]>
    >
  : Function["functionType"] extends "Mutation"
    ? RegisteredMutation<
        Lowercase<Function["functionVisibility"]>,
        Function["args"]["Encoded"],
        Promise<Function["returns"]["Encoded"]>
      >
    : Function["functionType"] extends "Action"
      ? RegisteredAction<
          Lowercase<Function["functionVisibility"]>,
          Function["args"]["Encoded"],
          Promise<Function["returns"]["Encoded"]>
        >
      : never;
