import {
  Expand,
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  NamedTableInfo,
  OptionalRestArgs,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { GenericId } from "convex/values";
import { Effect } from "effect";

import { ConfectAuth, ConfectAuthImpl } from "~/src/auth";
import {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableNamesInConfectDataModel,
} from "~/src/data-model";
import {
  ConfectDatabaseReader,
  ConfectDatabaseReaderImpl,
  ConfectDatabaseWriter,
  DatabaseSchemasFromConfectDataModel,
  EffectDatabaseWriterImpl,
} from "~/src/database";
import { ConfectScheduler, ConfectSchedulerImpl } from "~/src/scheduler";
import {
  ConfectStorageReader,
  ConfectStorageReaderImpl,
  ConfectStorageWriter,
  ConfectStorageWriterImpl,
} from "~/src/storage";

export type ConfectMutationCtx<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  db: ConfectDatabaseWriter<ConfectDataModel>;
  auth: ConfectAuth;
  storage: ConfectStorageWriter;
  scheduler: ConfectScheduler;
};

export type ConfectQueryCtx<ConfectDataModel extends GenericConfectDataModel> =
  {
    db: ConfectDatabaseReader<ConfectDataModel>;
    auth: ConfectAuth;
    storage: ConfectStorageReader;
  };

export type ConfectActionCtx<ConfectDataModel extends GenericConfectDataModel> =
  {
    runQuery<Query extends FunctionReference<"query", "public" | "internal">>(
      query: Query,
      ...args: OptionalRestArgs<Query>
    ): Effect.Effect<FunctionReturnType<Query>>;
    runMutation<
      Mutation extends FunctionReference<"mutation", "public" | "internal">,
    >(
      mutation: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Effect.Effect<FunctionReturnType<Mutation>>;
    runAction<
      Action extends FunctionReference<"action", "public" | "internal">,
    >(
      action: Action,
      ...args: OptionalRestArgs<Action>
    ): Effect.Effect<FunctionReturnType<Action>>;
    scheduler: ConfectScheduler;
    auth: ConfectAuth;
    storage: ConfectStorageWriter;
    vectorSearch<
      TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
      IndexName extends VectorIndexNames<
        NamedTableInfo<
          DataModelFromConfectDataModel<ConfectDataModel>,
          TableName
        >
      >,
    >(
      tableName: TableName,
      indexName: IndexName,
      query: Expand<
        VectorSearchQuery<
          NamedTableInfo<
            DataModelFromConfectDataModel<ConfectDataModel>,
            TableName
          >,
          IndexName
        >
      >
    ): Effect.Effect<Array<{ _id: GenericId<TableName>; _score: number }>>;
  };

export const makeEffectQueryCtx = <
  EffectDataModel extends GenericConfectDataModel,
>(
  ctx: GenericQueryCtx<DataModelFromConfectDataModel<EffectDataModel>>,
  databaseSchemas: DatabaseSchemasFromConfectDataModel<EffectDataModel>
): ConfectQueryCtx<EffectDataModel> => ({
  db: new ConfectDatabaseReaderImpl(ctx.db, databaseSchemas),
  auth: new ConfectAuthImpl(ctx.auth),
  storage: new ConfectStorageReaderImpl(ctx.storage),
});

export const makeEffectMutationCtx = <
  EffectDataModel extends GenericConfectDataModel,
>(
  ctx: GenericMutationCtx<DataModelFromConfectDataModel<EffectDataModel>>,
  databaseSchemas: DatabaseSchemasFromConfectDataModel<EffectDataModel>
): ConfectMutationCtx<EffectDataModel> => ({
  db: new EffectDatabaseWriterImpl(ctx.db, databaseSchemas),
  auth: new ConfectAuthImpl(ctx.auth),
  storage: new ConfectStorageWriterImpl(ctx.storage),
  scheduler: new ConfectSchedulerImpl(ctx.scheduler),
});

export const makeEffectActionCtx = <
  ConfectDataModel extends GenericConfectDataModel,
>(
  ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>
): ConfectActionCtx<ConfectDataModel> => ({
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
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModelFromConfectDataModel<ConfectDataModel>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<
          DataModelFromConfectDataModel<ConfectDataModel>,
          TableName
        >,
        IndexName
      >
    >
  ) => Effect.promise(() => ctx.vectorSearch(tableName, indexName, query)),
  auth: new ConfectAuthImpl(ctx.auth),
  storage: new ConfectStorageWriterImpl(ctx.storage),
  scheduler: new ConfectSchedulerImpl(ctx.scheduler),
});
