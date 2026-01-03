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
  Effect,
  Layer,
  Match,
  pipe,
  Predicate,
  Ref,
  Schema,
  type Types,
} from "effect";
import type * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as GroupSpec from "@confect/core/GroupSpec";
import type * as Spec from "@confect/core/Spec";
import { mapLeaves } from "./internal/utils";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import type * as Api from "./Api";
import * as Auth from "./Auth";
import * as DatabaseReader from "./DatabaseReader";
import type * as DatabaseSchema from "./DatabaseSchema";
import * as DatabaseWriter from "./DatabaseWriter";
import type * as DataModel from "./DataModel";
import * as MutationCtx from "./MutationCtx";
import * as MutationRunner from "./MutationRunner";
import * as QueryCtx from "./QueryCtx";
import * as QueryRunner from "./QueryRunner";
import * as Registry from "./Registry";
import * as RegistryItem from "./RegistryItem";
import * as Scheduler from "./Scheduler";
import * as SchemaToValidator from "./SchemaToValidator";
import { StorageActionWriter, StorageReader, StorageWriter } from "./Storage";
import * as VectorSearch from "./VectorSearch";

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

export const TypeId = "@rjdellecese/confect/server/Server";
export type TypeId = typeof TypeId;

export const isServer = (u: unknown): u is Server<Api.AnyWithProps> =>
  Predicate.hasProperty(u, TypeId);

export type RegisteredFunctions<Spec_ extends Spec.AnyWithProps> =
  Types.Simplify<RegisteredFunctionsHelper<Spec.Groups<Spec_>>>;

export interface Server<Api_ extends Api.AnyWithProps> {
  readonly [TypeId]: TypeId;
  readonly registeredFunctions: RegisteredFunctions<Api_["spec"]>;
}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <Api_ extends Api.AnyWithProps>({
  registeredFunctions,
}: {
  registeredFunctions: RegisteredFunctions<Api_["spec"]>;
}): Server<Api_> =>
  Object.assign(Object.create(Proto), {
    registeredFunctions,
  });

export const make = <Api_ extends Api.AnyWithProps>(api: Api_) =>
  Effect.gen(function* () {
    const registry = yield* Registry.Registry;
    const functionImplItems = yield* Ref.get(registry);

    const registeredFunctions = mapLeaves<
      RegistryItem.AnyWithProps,
      RegisteredFunction
    >(functionImplItems, RegistryItem.isRegistryItem, (registryItem) =>
      makeRegisteredFunction(api, registryItem),
    ) as RegisteredFunctions<Api_["spec"]>;

    return makeProto<Api_>({ registeredFunctions });
  });

const makeRegisteredFunction = <Api_ extends Api.AnyWithProps>(
  api: Api_,
  { function_, handler }: RegistryItem.AnyWithProps,
): RegisteredFunction =>
  Match.value(function_.functionType).pipe(
    Match.when("Query", () => {
      const genericFunction = Match.value(function_.functionVisibility).pipe(
        Match.when("Public", () => queryGeneric),
        Match.when("Internal", () => internalQueryGeneric),
        Match.exhaustive,
      );

      return genericFunction(
        queryFunction(api.databaseSchema, {
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
        mutationFunction(api.databaseSchema, {
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
        actionFunction({
          args: function_.args,
          returns: function_.returns,
          handler,
        }),
      );
    }),
    Match.exhaustive,
  );

const queryFunction = <
  Schema extends DatabaseSchema.AnyWithProps,
  ConvexArgs extends DefaultFunctionArgs,
  Args,
  ConvexReturns,
  Returns,
  E,
>(
  schema: Schema,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
    handler: (
      a: Args,
    ) => Effect.Effect<
      Returns,
      E,
      | DatabaseReader.DatabaseReader<Schema>
      | Auth.Auth
      | StorageReader
      | QueryRunner.QueryRunner
      | QueryCtx.QueryCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>
    >;
  },
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericQueryCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
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
              DatabaseReader.layer(schema, ctx.db),
              Auth.layer(ctx.auth),
              StorageReader.layer(ctx.storage),
              QueryRunner.layer(ctx.runQuery),
              Layer.succeed(
                QueryCtx.QueryCtx<
                  DataModel.ToConvex<DataModel.FromSchema<Schema>>
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

const mutationFunction = <
  Schema extends DatabaseSchema.AnyWithProps,
  ConvexArgs extends DefaultFunctionArgs,
  Args,
  ConvexReturns,
  Returns,
  E,
>(
  schema: Schema,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<Args, ConvexArgs>;
    returns: Schema.Schema<Returns, ConvexReturns>;
    handler: (
      a: Args,
    ) => Effect.Effect<
      Returns,
      E,
      | DatabaseReader.DatabaseReader<Schema>
      | DatabaseWriter.DatabaseWriter<Schema>
      | Auth.Auth
      | Scheduler.Scheduler
      | StorageReader
      | StorageWriter
      | QueryRunner.QueryRunner
      | MutationRunner.MutationRunner
      | MutationCtx.MutationCtx<
          DataModel.ToConvex<DataModel.FromSchema<Schema>>
        >
    >;
  },
) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericMutationCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
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
              DatabaseReader.layer(schema, ctx.db),
              DatabaseWriter.layer(schema, ctx.db),
              Auth.layer(ctx.auth),
              Scheduler.layer(ctx.scheduler),
              StorageReader.layer(ctx.storage),
              StorageWriter.layer(ctx.storage),
              QueryRunner.layer(ctx.runQuery),
              MutationRunner.layer(ctx.runMutation),
              Layer.succeed(
                MutationCtx.MutationCtx<
                  DataModel.ToConvex<DataModel.FromSchema<Schema>>
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

const actionFunction = <
  Schema extends DatabaseSchema.AnyWithProps,
  ConvexValue extends DefaultFunctionArgs,
  Value,
  ConvexReturns,
  Returns,
  E,
>({
  args,
  returns,
  handler,
}: {
  args: Schema.Schema<Value, ConvexValue>;
  returns: Schema.Schema<Returns, ConvexReturns>;
  handler: (
    a: Value,
  ) => Effect.Effect<
    Returns,
    E,
    | Scheduler.Scheduler
    | Auth.Auth
    | StorageReader
    | StorageWriter
    | StorageActionWriter
    | QueryRunner.QueryRunner
    | MutationRunner.MutationRunner
    | ActionRunner.ActionRunner
    | VectorSearch.VectorSearch<DataModel.FromSchema<Schema>>
    | ActionCtx.ActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>
  >;
}) => ({
  args: SchemaToValidator.compileArgsSchema(args),
  returns: SchemaToValidator.compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<DataModel.ToConvex<DataModel.FromSchema<Schema>>>,
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
              Scheduler.layer(ctx.scheduler),
              Auth.layer(ctx.auth),
              StorageReader.layer(ctx.storage),
              StorageWriter.layer(ctx.storage),
              StorageActionWriter.layer(ctx.storage),
              QueryRunner.layer(ctx.runQuery),
              MutationRunner.layer(ctx.runMutation),
              ActionRunner.layer(ctx.runAction),
              VectorSearch.layer(ctx.vectorSearch),
              Layer.succeed(
                ActionCtx.ActionCtx<
                  DataModel.ToConvex<DataModel.FromSchema<Schema>>
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

export interface RegisteredFunctionsAnyWithProps {
  readonly [key: string]: RegisteredFunction | RegisteredFunctionsAnyWithProps;
}

export type RegisteredFunctionsHelper<Groups extends GroupSpec.AnyWithProps> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? GroupSpec.Groups<Group> extends infer SubGroups extends
        GroupSpec.AnyWithProps
      ? Types.Simplify<
          RegisteredFunctionsHelper<SubGroups> & {
            [FunctionName in FunctionSpec.Name<
              GroupSpec.Functions<Group>
            >]: FunctionSpec.WithName<
              GroupSpec.Functions<Group>,
              FunctionName
            > extends infer Function extends FunctionSpec.AnyWithProps
              ? FunctionSpec.RegisteredFunction<Function>
              : never;
          }
        >
      : {
          [FunctionName in FunctionSpec.Name<
            GroupSpec.Functions<Group>
          >]: FunctionSpec.WithName<
            GroupSpec.Functions<Group>,
            FunctionName
          > extends infer Function extends FunctionSpec.AnyWithProps
            ? FunctionSpec.RegisteredFunction<Function>
            : never;
        }
    : never;
};
