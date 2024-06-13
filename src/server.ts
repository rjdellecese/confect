import * as Schema from "@effect/schema/Schema";
import {
  actionGeneric,
  DefaultFunctionArgs,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericSchema,
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
} from "~/src/ctx";
import {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "~/src/data-model";
import {
  DatabaseSchemasFromConfectDataModel,
  schemasFromConfectSchema,
} from "~/src/db";
import {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "~/src/schema";
import schemaToValidatorCompiler from "~/src/schema-to-validator-compiler";

export const confectServer = <
  DatabaseSchema extends GenericSchema,
  TypeScriptSchema extends GenericConfectSchema,
>(
  effectSchemaDefinition: ConfectSchemaDefinition<
    DatabaseSchema,
    TypeScriptSchema
  >
) => {
  const databaseSchemas = schemasFromConfectSchema(
    effectSchemaDefinition.confectSchema
  );

  const query = <
    DatabaseValue extends DefaultFunctionArgs,
    TypeScriptValue,
    Output,
  >({
    args,
    handler,
  }: {
    args: Schema.Schema<TypeScriptValue, DatabaseValue>;
    handler: (
      ctx: EffectQueryCtx<ConfectDataModelFromConfectSchema<TypeScriptSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<Output>;
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
    args: Schema.Schema<TypeScriptValue, DatabaseValue>;
    handler: (
      ctx: EffectQueryCtx<ConfectDataModelFromConfectSchema<TypeScriptSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<Output>;
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
    args: Schema.Schema<TypeScriptValue, DatabaseValue>;
    handler: (
      ctx: EffectMutationCtx<
        ConfectDataModelFromConfectSchema<TypeScriptSchema>
      >,
      a: TypeScriptValue
    ) => Effect.Effect<Output>;
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
    args: Schema.Schema<TypeScriptValue, DatabaseValue>;
    handler: (
      ctx: EffectMutationCtx<
        ConfectDataModelFromConfectSchema<TypeScriptSchema>
      >,
      a: TypeScriptValue
    ) => Effect.Effect<Output>;
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
    args: Schema.Schema<TypeScriptValue, DatabaseValue>;
    handler: (
      ctx: EffectActionCtx<ConfectDataModelFromConfectSchema<TypeScriptSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<Output>;
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
    args: Schema.Schema<TypeScriptValue, DatabaseValue>;
    handler: (
      ctx: EffectActionCtx<ConfectDataModelFromConfectSchema<TypeScriptSchema>>,
      a: TypeScriptValue
    ) => Effect.Effect<Output>;
  }): RegisteredAction<"internal", DatabaseValue, Promise<Output>> =>
    internalActionGeneric(effectActionFunction({ args, handler }));

  const httpAction = (
    handler: (
      ctx: EffectActionCtx<ConfectDataModelFromConfectSchema<TypeScriptSchema>>,
      request: Request
    ) => Effect.Effect<Response>
    // @ts-expect-error `GenericActionCtx<GenericDataModel>` is not assignable to `GenericActionCtx<DataModelFromEffectDataModel<EffectDataModel>>`
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
  EffectDataModel extends GenericConfectDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  databaseSchemas,
  args,
  handler,
}: {
  databaseSchemas: DatabaseSchemasFromConfectDataModel<EffectDataModel>;
  args: Schema.Schema<TypeScriptValue, DatabaseValue>;
  handler: (
    ctx: EffectQueryCtx<EffectDataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericQueryCtx<DataModelFromConfectDataModel<EffectDataModel>>,
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
  EffectDataModel extends GenericConfectDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  databaseSchemas,
  args,
  handler,
}: {
  databaseSchemas: DatabaseSchemasFromConfectDataModel<EffectDataModel>;
  args: Schema.Schema<TypeScriptValue, DatabaseValue>;
  handler: (
    ctx: EffectMutationCtx<EffectDataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericMutationCtx<DataModelFromConfectDataModel<EffectDataModel>>,
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
  EffectDataModel extends GenericConfectDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  args,
  handler,
}: {
  args: Schema.Schema<TypeScriptValue, DatabaseValue>;
  handler: (
    ctx: EffectActionCtx<EffectDataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericActionCtx<DataModelFromConfectDataModel<EffectDataModel>>,
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
  EffectDataModel extends GenericConfectDataModel,
>({
  handler,
}: {
  handler: (
    ctx: EffectActionCtx<EffectDataModel>,
    request: Request
  ) => Effect.Effect<Response>;
}) => ({
  handler: (
    ctx: GenericActionCtx<DataModelFromConfectDataModel<EffectDataModel>>,
    request: Request
  ): Promise<Response> =>
    Effect.runPromise(handler(makeEffectActionCtx(ctx), request)),
});
