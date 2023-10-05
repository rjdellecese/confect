import * as Schema from "@effect/schema/Schema";
import {
  actionGeneric,
  ArgsArray,
  DefaultFunctionArgs,
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  httpActionGeneric,
  internalActionGeneric,
  NamedTableInfo,
  OptionalRestArgs,
  RegisteredAction,
  TableNamesInDataModel,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { GenericId } from "convex/values";
import { Effect, pipe } from "effect";

import { EffectAuth, EffectAuthImpl } from "./auth";
import {
  EffectDatabaseReader,
  EffectDatabaseReaderImpl,
  EffectDatabaseWriter,
  EffectDatabaseWriterImpl,
} from "./db";
import { EffectScheduler, EffectSchedulerImpl } from "./scheduler";
import schemaToValidatorCompiler from "./schema-to-validator-compiler";
import {
  EffectStorageReader,
  EffectStorageReaderImpl,
  EffectStorageWriter,
  EffectStorageWriterImpl,
} from "./storage";

type EffectMutationCtx<DataModel extends GenericDataModel> = {
  db: EffectDatabaseWriter<DataModel>;
  auth: EffectAuth;
  storage: EffectStorageWriter;
  scheduler: EffectScheduler;
};

type EffectQueryCtx<DataModel extends GenericDataModel> = {
  db: EffectDatabaseReader<DataModel>;
  auth: EffectAuth;
  storage: EffectStorageReader;
};

type EffectActionCtx<DataModel extends GenericDataModel> = {
  runQuery<Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Effect.Effect<never, never, FunctionReturnType<Query>>;
  runMutation<
    Mutation extends FunctionReference<"mutation", "public" | "internal">,
  >(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Effect.Effect<never, never, FunctionReturnType<Mutation>>;
  runAction<Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Effect.Effect<never, never, FunctionReturnType<Action>>;
  scheduler: EffectScheduler;
  auth: EffectAuth;
  storage: EffectStorageWriter;
  vectorSearch<
    TableName extends TableNamesInDataModel<DataModel>,
    IndexName extends VectorIndexNames<NamedTableInfo<DataModel, TableName>>,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<NamedTableInfo<DataModel, TableName>, IndexName>
    >
  ): Effect.Effect<
    never,
    never,
    Array<{ _id: GenericId<TableName>; _score: number }>
  >;
};

const makeEffectActionCtx = <DataModel extends GenericDataModel>(
  ctx: GenericActionCtx<DataModel>
): EffectActionCtx<DataModel> => ({
  runQuery: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...queryArgs: OptionalRestArgs<Query>
  ) => Effect.promise(() => ctx.runQuery(query, ...queryArgs)),
  runMutation: <
    Mutation extends FunctionReference<"mutation", "public" | "internal">,
  >(
    mutation: Mutation,
    ...mutationArgs: OptionalRestArgs<Mutation>
  ) => Effect.promise(() => ctx.runMutation(mutation, ...mutationArgs)),
  runAction: <
    Action extends FunctionReference<"action", "public" | "internal">,
  >(
    action: Action,
    ...actionArgs: OptionalRestArgs<Action>
  ) => Effect.promise(() => ctx.runAction(action, ...actionArgs)),
  vectorSearch: <
    TableName extends TableNamesInDataModel<DataModel>,
    IndexName extends VectorIndexNames<NamedTableInfo<DataModel, TableName>>,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<NamedTableInfo<DataModel, TableName>, IndexName>
    >
  ) => Effect.promise(() => ctx.vectorSearch(tableName, indexName, query)),
  auth: new EffectAuthImpl(ctx.auth),
  storage: new EffectStorageWriterImpl(ctx.storage),
  scheduler: new EffectSchedulerImpl(ctx.scheduler),
});

type Handler<
  DataModel extends GenericDataModel,
  Ctx extends GenericQueryCtx<DataModel>,
  Args extends ArgsArray,
  Output,
> = (ctx: Ctx, ...args: Args) => Output;

export const EffectConvex = <DataModel extends GenericDataModel>() => {
  const withEffectQuery = <Args extends ArgsArray, Output>(
    f: (ctx: EffectMutationCtx<DataModel>, ...args: Args) => Output
  ): Handler<DataModel, GenericMutationCtx<DataModel>, Args, Output> => {
    return (ctx: GenericMutationCtx<DataModel>, ...args: Args) => {
      const effectDb = new EffectDatabaseWriterImpl(ctx, ctx.db);
      const effectAuth = new EffectAuthImpl(ctx.auth);
      const effectStorage = new EffectStorageWriterImpl(ctx.storage);
      const effectScheduler = new EffectSchedulerImpl(ctx.scheduler);
      return f(
        {
          db: effectDb,
          auth: effectAuth,
          storage: effectStorage,
          scheduler: effectScheduler,
        },
        ...args
      );
    };
  };
  const withEffectMutation = <Args extends ArgsArray, Output>(
    f: (ctx: EffectQueryCtx<DataModel>, ...args: Args) => Output
  ): Handler<DataModel, GenericQueryCtx<DataModel>, Args, Output> => {
    return (ctx: GenericQueryCtx<DataModel>, ...args: Args) => {
      const effectDb = new EffectDatabaseReaderImpl(ctx, ctx.db);
      const effectAuth = new EffectAuthImpl(ctx.auth);
      const effectStorage = new EffectStorageReaderImpl(ctx.storage);
      return f(
        {
          db: effectDb,
          auth: effectAuth,
          storage: effectStorage,
        },
        ...args
      );
    };
  };
  const withEffectAction = <Args extends ArgsArray, Output>(
    f: (
      ctx: EffectActionCtx<DataModel>,
      ...args: Args
    ) => Effect.Effect<never, never, Output>
  ) => {
    return (ctx: GenericActionCtx<DataModel>, ...args: Args) => {
      return pipe(f(makeEffectActionCtx(ctx), ...args), Effect.runPromise);
    };
  };
  const withEffectHttpAction = (
    f: (
      ctx: EffectActionCtx<DataModel>,
      request: Request
    ) => Effect.Effect<never, never, Response>
  ) => {
    return (ctx: GenericActionCtx<DataModel>, request: Request) => {
      return pipe(f(makeEffectActionCtx(ctx), request), Effect.runPromise);
    };
  };
  const httpAction = (
    handler: (
      ctx: EffectActionCtx<DataModel>,
      request: Request
    ) => Effect.Effect<never, never, Response>
  ) =>
    httpActionGeneric((ctx: GenericActionCtx<DataModel>, request: Request) =>
      withEffectHttpAction(handler)(ctx, request)
    );
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
    internalActionGeneric(
      (ctx: GenericActionCtx<DataModel>, ...actualArgs: Args) =>
        withEffectAction(actionFunction({ args, handler }))
    );

  return {
    withEffectQuery,
    withEffectMutation,
    withEffectAction,
    httpAction,
  };
};

const actionFunction = <
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
  handler: (ctx: EffectActionCtx<DataModel>, actualArgs: I): Promise<O> =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.flatMap((decodedArgs) => handler(ctx, decodedArgs)),
      Effect.runPromise
    ),
});

const internalAction = <
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
    ctx: GenericActionCtx<DataModel>,
    a: A
  ) => Effect.Effect<never, never, O>;
}): RegisteredAction<"internal", I, Promise<O>> =>
  internalActionGeneric(actionFunction({ args, handler }));

const action = <
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
    ctx: GenericActionCtx<DataModel>,
    a: A
  ) => Effect.Effect<never, never, O>;
}): RegisteredAction<"public", I, Promise<O>> =>
  actionGeneric(actionFunction({ args, handler }));

// NOTE: Remove if/when exposed

type Expand<ObjectType extends Record<any, any>> = ObjectType extends Record<
  any,
  any
>
  ? {
      [Key in keyof ObjectType]: ObjectType[Key];
    }
  : never;
