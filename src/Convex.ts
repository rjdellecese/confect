import * as Schema from "@effect/schema/Schema";
import {
  actionGeneric,
  DefaultFunctionArgs,
  GenericActionCtx,
  GenericDataModel,
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
import schemaToValidatorCompiler from "./schema-to-validator-compiler";

export const Convex = <DataModel extends GenericDataModel>() => {
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
      ctx: EffectQueryCtx<DataModel>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredQuery<"public", DatabaseValue, Promise<Output>> =>
    queryGeneric(effectQueryFunction({ args, handler }));

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
      ctx: EffectQueryCtx<DataModel>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredQuery<"internal", DatabaseValue, Promise<Output>> =>
    internalQueryGeneric(effectQueryFunction({ args, handler }));

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
      ctx: EffectMutationCtx<DataModel>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredMutation<"public", DatabaseValue, Promise<Output>> =>
    mutationGeneric(effectMutationFunction({ args, handler }));

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
      ctx: EffectMutationCtx<DataModel>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredMutation<"internal", DatabaseValue, Promise<Output>> =>
    internalMutationGeneric(effectMutationFunction({ args, handler }));

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
      ctx: EffectActionCtx<DataModel>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredAction<"internal", DatabaseValue, Promise<Output>> =>
    internalActionGeneric(effectActionFunction({ args, handler }));

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
      ctx: EffectActionCtx<DataModel>,
      a: TypeScriptValue
    ) => Effect.Effect<never, never, Output>;
  }): RegisteredAction<"public", DatabaseValue, Promise<Output>> =>
    actionGeneric(effectActionFunction({ args, handler }));

  const httpAction = (
    handler: (
      ctx: EffectActionCtx<DataModel>,
      request: Request
    ) => Effect.Effect<never, never, Response>
  ) =>
    httpActionGeneric((ctx: GenericActionCtx<DataModel>, request: Request) =>
      Effect.runPromise(handler(makeEffectActionCtx(ctx), request))
    );

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
  DataModel extends GenericDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  args,
  handler,
}: {
  args: Schema.Schema<DatabaseValue, TypeScriptValue>;
  handler: (
    ctx: EffectQueryCtx<DataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<never, never, Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericQueryCtx<DataModel>,
    actualArgs: DatabaseValue
  ): Promise<Output> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.flatMap((decodedArgs) =>
        handler(makeEffectQueryCtx(ctx), decodedArgs)
      ),
      Effect.runPromise
    ),
});

const effectMutationFunction = <
  DataModel extends GenericDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  args,
  handler,
}: {
  args: Schema.Schema<DatabaseValue, TypeScriptValue>;
  handler: (
    ctx: EffectMutationCtx<DataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<never, never, Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericMutationCtx<DataModel>,
    actualArgs: DatabaseValue
  ): Promise<Output> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.flatMap((decodedArgs) =>
        handler(makeEffectMutationCtx(ctx), decodedArgs)
      ),
      Effect.runPromise
    ),
});

const effectActionFunction = <
  DataModel extends GenericDataModel,
  DatabaseValue extends DefaultFunctionArgs,
  TypeScriptValue,
  Output,
>({
  args,
  handler,
}: {
  args: Schema.Schema<DatabaseValue, TypeScriptValue>;
  handler: (
    ctx: EffectActionCtx<DataModel>,
    a: TypeScriptValue
  ) => Effect.Effect<never, never, Output>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (
    ctx: GenericActionCtx<DataModel>,
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
