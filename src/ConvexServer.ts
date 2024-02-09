import * as Schema from "@effect/schema/Schema";
import {
  actionGeneric,
  DefaultFunctionArgs,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { Effect, pipe } from "effect";

import {
  EffectActionCtx,
  EffectMutationCtx,
  EffectQueryCtx,
  makeEffectActionCtx,
  makeEffectMutationCtx,
  makeEffectQueryCtx,
} from "./ctx";
import {
  DatabaseSchemasFromEffectDataModel,
  databaseSchemasFromEffectSchema,
} from "./db";
import {
  DataModelFromEffectDataModel,
  EffectDataModelFromEffectSchema,
  GenericEffectDataModel,
  GenericEffectSchema,
} from "./schema";
import schemaToValidatorCompiler from "./schema-to-validator-compiler";

export const ConvexServer = <EffectSchema extends GenericEffectSchema>(
  effectSchema: EffectSchema
) => {
  const databaseSchemas = databaseSchemasFromEffectSchema(effectSchema);

  const query = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<DatabaseValue, TypeScriptValue>;
    handler: (
      ctx: EffectQueryCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredQuery<"public", DatabaseValue, Promise<Output>> =>
    queryGeneric(effectQueryFunction({ databaseSchemas, args, handler }));

  const internalQuery = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<DatabaseValue, TypeScriptValue>;
    handler: (
      ctx: EffectQueryCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredQuery<"internal", DatabaseValue, Promise<Output>> =>
    internalQueryGeneric(
      effectQueryFunction({ databaseSchemas, args, handler })
    );

  const mutation = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<DatabaseValue, TypeScriptValue>;
    handler: (
      ctx: EffectMutationCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredMutation<"public", DatabaseValue, Promise<Output>> =>
    mutationGeneric(effectMutationFunction({ databaseSchemas, args, handler }));

  const internalMutation = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<DatabaseValue, TypeScriptValue>;
    handler: (
      ctx: EffectMutationCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredMutation<"internal", DatabaseValue, Promise<Output>> =>
    internalMutationGeneric(
      effectMutationFunction({ databaseSchemas, args, handler })
    );

  const action = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<DatabaseValue, TypeScriptValue>;
    handler: (
      ctx: EffectActionCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredAction<"public", DatabaseValue, Promise<Output>> =>
    actionGeneric(effectActionFunction({ args, handler }));

  const internalAction = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<DatabaseValue, TypeScriptValue>;
    handler: (
      ctx: EffectActionCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredAction<"internal", DatabaseValue, Promise<Output>> =>
    internalActionGeneric(effectActionFunction({ args, handler }));

  const httpAction = (
    handler: (
      ctx: EffectActionCtx<EffectDataModelFromEffectSchema<EffectSchema>>,
      request: Request
    ) => Effect.Effect<never, never, Response>
    // TODO
  ) => httpActionGeneric(effectHttpActionFunction({ handler }));

  return {
    query,
    internalQuery,
    mutation,
    internalMutation,
    action,
    internalAction,
    httpAction,
  };
};

const effectQueryFunction = <
  EffectDataModel extends GenericEffectDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  databaseSchemas,
  args,
  handler,
}: {
  databaseSchemas: DatabaseSchemasFromEffectDataModel<EffectDataModel>;
  args: Schema.Schema<DatabaseValue, TypeScriptValue>;
  handler: (
    ctx: EffectQueryCtx<EffectDataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<never, never, Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericQueryCtx<DataModelFromEffectDataModel<EffectDataModel>>,
    actualArgs: DatabaseValue
  ): Promise<Output> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.flatMap((decodedArgs) =>
        handler(makeEffectQueryCtx(ctx, databaseSchemas), decodedArgs)
      ),
      Effect.runPromise
    ),
});

const effectMutationFunction = <
  EffectDataModel extends GenericEffectDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  databaseSchemas,
  args,
  handler,
}: {
  databaseSchemas: DatabaseSchemasFromEffectDataModel<EffectDataModel>;
  args: Schema.Schema<DatabaseValue, TypeScriptValue>;
  handler: (
    ctx: EffectMutationCtx<EffectDataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<never, never, Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericMutationCtx<DataModelFromEffectDataModel<EffectDataModel>>,
    actualArgs: DatabaseValue
  ): Promise<Output> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.flatMap((decodedArgs) =>
        handler(makeEffectMutationCtx(ctx, databaseSchemas), decodedArgs)
      ),
      Effect.runPromise
    ),
});

const effectActionFunction = <
  EffectDataModel extends GenericEffectDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  args,
  handler,
}: {
  args: Schema.Schema<DatabaseValue, TypeScriptValue>;
  handler: (
    ctx: EffectActionCtx<EffectDataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<never, never, Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericActionCtx<DataModelFromEffectDataModel<EffectDataModel>>,
    actualArgs: DatabaseValue
  ): Promise<Output> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.flatMap((decodedArgs) =>
        handler(makeEffectActionCtx(ctx), decodedArgs)
      ),
      Effect.runPromise
    ),
});

const effectHttpActionFunction = <
  EffectDataModel extends GenericEffectDataModel,
>({
  handler,
}: {
  handler: (
    ctx: EffectActionCtx<EffectDataModel>,
    request: Request
  ) => Effect.Effect<never, never, Response>;
}) => ({
  handler: (
    ctx: GenericActionCtx<DataModelFromEffectDataModel<EffectDataModel>>,
    request: Request
  ): Promise<Response> =>
    Effect.runPromise(
      handler(
        makeEffectActionCtx(
          ctx as GenericActionCtx<DataModelFromEffectDataModel<EffectDataModel>>
        ),
        request
      )
    ),
});
