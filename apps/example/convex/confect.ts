import {
  type ConfectDataModelFromConfectSchemaDefinition,
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
  type DataModelFromConfectDataModel,
  type GenericConfectDoc,
  GenericId,
  makeConfectFunctions,
  type TableNamesInConfectDataModel,
} from '@rjdellecese/confect/server';

import { confectSchema } from './schema';

export const {
  confectQuery,
  confectInternalQuery,
  confectMutation,
  confectInternalMutation,
  confectAction,
  confectInternalAction,
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} = makeConfectFunctions(confectSchema);

type ConfectSchemaDefinition = typeof confectSchema;

type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>;

type TableNames = TableNamesInConfectDataModel<ConfectDataModel>;

export type ConfectDoc<TableName extends TableNames> = GenericConfectDoc<
  ConfectDataModel,
  TableName
>;

export const Id = <TableName extends TableNames>(tableName: TableName) =>
  GenericId<TableName>(tableName);
export type Id<TableName extends TableNames> = GenericId<TableName>;

export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;
export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

export {
  ConfectActionRunner,
  ConfectAuth,
  ConfectMutationRunner,
  ConfectQueryRunner,
  ConfectScheduler,
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectVectorSearch,
} from '@rjdellecese/confect/server';

type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

export const QueryCtx = ConvexQueryCtx<DataModel>();
export type QueryCtx = typeof QueryCtx.Identifier;
export const MutationCtx = ConvexMutationCtx<DataModel>();
export type MutationCtx = typeof MutationCtx.Identifier;
export const ActionCtx = ConvexActionCtx<DataModel>();
export type ActionCtx = typeof ActionCtx.Identifier;
