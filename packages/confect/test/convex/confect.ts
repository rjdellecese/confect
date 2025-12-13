import type {
  GenericConfectDoc as ConfectDocType,
  DataModelFromConfectDataModel,
  TableNamesInConfectDataModel,
} from "../../src/server/ConfectDataModel";
import type { ConfectDataModelFromConfectSchema } from "../../src/server/ConfectSchema";
import {
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../../src/server/ctx";
import { makeConfectFunctions } from "../../src/server/functions";
import { GenericId } from "../../src/server/schemas/GenericId";
import { confectSchema } from "../convex/schema";

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

type ConfectSchema = typeof confectSchema;

type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

type TableNames = TableNamesInConfectDataModel<ConfectDataModel>;

export type ConfectDoc<TableName extends TableNames> = ConfectDocType<
  ConfectDataModel,
  TableName
>;

export const Id = <TableName extends TableNames>(tableName: TableName) =>
  GenericId<TableName>(tableName);
export type Id<TableName extends TableNames> = GenericId<TableName>;

export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;
export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

export { ConfectAuth } from "../../src/server/ConfectAuth";
export { ConfectScheduler } from "../../src/server/ConfectScheduler";
export {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "../../src/server/ConfectStorage";
export { ConfectVectorSearch } from "../../src/server/ConfectVectorSearch";
export {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../../src/server/runners";

type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

export const QueryCtx = ConvexQueryCtx<DataModel>();
export type QueryCtx = typeof QueryCtx.Identifier;
export const MutationCtx = ConvexMutationCtx<DataModel>();
export type MutationCtx = typeof MutationCtx.Identifier;
export const ActionCtx = ConvexActionCtx<DataModel>();
export type ActionCtx = typeof ActionCtx.Identifier;
