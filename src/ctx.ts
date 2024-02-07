import {
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  NamedTableInfo,
  OptionalRestArgs,
  TableNamesInDataModel,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { GenericId } from "convex/values";
import { Effect } from "effect";

import { EffectAuth, EffectAuthImpl } from "./auth";
import {
  EffectDatabaseReader,
  EffectDatabaseReaderImpl,
  EffectDatabaseWriter,
  EffectDatabaseWriterImpl,
} from "./db";
import { EffectScheduler, EffectSchedulerImpl } from "./scheduler";
import { DataModelFromEffectDataModel, GenericEffectDataModel } from "./schema";
import {
  EffectStorageReader,
  EffectStorageReaderImpl,
  EffectStorageWriter,
  EffectStorageWriterImpl,
} from "./storage";

export type EffectMutationCtx<EffectDataModel extends GenericEffectDataModel> =
  {
    db: EffectDatabaseWriter<EffectDataModel>;
    auth: EffectAuth;
    storage: EffectStorageWriter;
    scheduler: EffectScheduler;
  };

export type EffectQueryCtx<EffectDataModel extends GenericEffectDataModel> = {
  db: EffectDatabaseReader<EffectDataModel>;
  auth: EffectAuth;
  storage: EffectStorageReader;
};

export type EffectActionCtx<EffectDataModel extends GenericEffectDataModel> = {
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
    TableName extends TableNamesInDataModel<EffectDataModel>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<EffectDataModel, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<NamedTableInfo<EffectDataModel, TableName>, IndexName>
    >
  ): Effect.Effect<
    never,
    never,
    Array<{ _id: GenericId<TableName>; _score: number }>
  >;
};

export const makeEffectQueryCtx = <
  EffectDataModel extends GenericEffectDataModel,
>(
  ctx: GenericQueryCtx<DataModelFromEffectDataModel<EffectDataModel>>
): EffectQueryCtx<EffectDataModel> => ({
  db: new EffectDatabaseReaderImpl(ctx, ctx.db),
  auth: new EffectAuthImpl(ctx.auth),
  storage: new EffectStorageReaderImpl(ctx.storage),
});

export const makeEffectMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericMutationCtx<DataModel>
): EffectMutationCtx<DataModel> => ({
  db: new EffectDatabaseWriterImpl(ctx, ctx.db),
  auth: new EffectAuthImpl(ctx.auth),
  storage: new EffectStorageWriterImpl(ctx.storage),
  scheduler: new EffectSchedulerImpl(ctx.scheduler),
});

export const makeEffectActionCtx = <
  EffectDataModel extends GenericEffectDataModel,
>(
  ctx: GenericActionCtx<EffectDataModel>
): EffectActionCtx<EffectDataModel> => ({
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
    TableName extends TableNamesInDataModel<EffectDataModel>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<EffectDataModel, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<NamedTableInfo<EffectDataModel, TableName>, IndexName>
    >
  ) => Effect.promise(() => ctx.vectorSearch(tableName, indexName, query)),
  auth: new EffectAuthImpl(ctx.auth),
  storage: new EffectStorageWriterImpl(ctx.storage),
  scheduler: new EffectSchedulerImpl(ctx.scheduler),
});

// NOTE: Remove if/when exposed

type Expand<ObjectType extends Record<any, any>> = ObjectType extends Record<
  any,
  any
>
  ? {
      [Key in keyof ObjectType]: ObjectType[Key];
    }
  : never;
