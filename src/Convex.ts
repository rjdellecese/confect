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
  const query = <I extends DefaultFunctionArgs, A, O>({
    args,
    handler,
  }: {
    args: Schema.Schema<I, A>;
    handler: (
      ctx: EffectQueryCtx<DataModel>,
      a: A
    ) => Effect.Effect<never, never, O>;
  }): RegisteredQuery<"public", I, Promise<O>> =>
    queryGeneric(effectQueryFunction({ args, handler }));

  const internalQuery = <I extends DefaultFunctionArgs, A, O>({
    args,
    handler,
  }: {
    args: Schema.Schema<I, A>;
    handler: (
      ctx: EffectQueryCtx<DataModel>,
      a: A
    ) => Effect.Effect<never, never, O>;
  }): RegisteredQuery<"internal", I, Promise<O>> =>
    internalQueryGeneric(effectQueryFunction({ args, handler }));

  const mutation = <I extends DefaultFunctionArgs, A, O>({
    args,
    handler,
  }: {
    args: Schema.Schema<I, A>;
    handler: (
      ctx: EffectMutationCtx<DataModel>,
      a: A
    ) => Effect.Effect<never, never, O>;
  }): RegisteredMutation<"public", I, Promise<O>> =>
    mutationGeneric(effectMutationFunction({ args, handler }));

  const internalMutation = <I extends DefaultFunctionArgs, A, O>({
    args,
    handler,
  }: {
    args: Schema.Schema<I, A>;
    handler: (
      ctx: EffectMutationCtx<DataModel>,
      a: A
    ) => Effect.Effect<never, never, O>;
  }): RegisteredMutation<"internal", I, Promise<O>> =>
    internalMutationGeneric(effectMutationFunction({ args, handler }));

  const internalAction = <I extends DefaultFunctionArgs, A, O>({
    args,
    handler,
  }: {
    args: Schema.Schema<I, A>;
    handler: (
      ctx: EffectActionCtx<DataModel>,
      a: A
    ) => Effect.Effect<never, never, O>;
  }): RegisteredAction<"internal", I, Promise<O>> =>
    internalActionGeneric(effectActionFunction({ args, handler }));

  const action = <I extends DefaultFunctionArgs, A, O>({
    args,
    handler,
  }: {
    args: Schema.Schema<I, A>;
    handler: (
      ctx: EffectActionCtx<DataModel>,
      a: A
    ) => Effect.Effect<never, never, O>;
  }): RegisteredAction<"public", I, Promise<O>> =>
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
  I extends DefaultFunctionArgs,
  A,
  O,
>({
  args,
  handler,
}: {
  args: Schema.Schema<I, A>;
  handler: (
    ctx: EffectQueryCtx<DataModel>,
    a: A
  ) => Effect.Effect<never, never, O>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (ctx: GenericQueryCtx<DataModel>, actualArgs: I): Promise<O> =>
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
  I extends DefaultFunctionArgs,
  A,
  O,
>({
  args,
  handler,
}: {
  args: Schema.Schema<I, A>;
  handler: (
    ctx: EffectMutationCtx<DataModel>,
    a: A
  ) => Effect.Effect<never, never, O>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (ctx: GenericMutationCtx<DataModel>, actualArgs: I): Promise<O> =>
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
  I extends DefaultFunctionArgs,
  A,
  O,
>({
  args,
  handler,
}: {
  args: Schema.Schema<I, A>;
  handler: (
    ctx: EffectActionCtx<DataModel>,
    a: A
  ) => Effect.Effect<never, never, O>;
}) => ({
  args: schemaToValidatorCompiler.args(args),
  handler: (ctx: GenericActionCtx<DataModel>, actualArgs: I): Promise<O> =>
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
