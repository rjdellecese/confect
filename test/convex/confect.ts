import type {
  ConfectDoc as ConfectDocType,
  TableNamesInConfectDataModel,
} from "~/src/server/data-model";
import { makeConfectFunctions } from "~/src/server/functions";
import type { ConfectDataModelFromConfectSchemaDefinition } from "~/src/server/schema";
import { confectSchema } from "~/test/convex/schema";

export const {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  ConfectVectorSearch,
} = makeConfectFunctions(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDocType<ConfectDataModel, TableName>;

// Services

export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;
export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;
export type ConfectVectorSearch = typeof ConfectVectorSearch.Identifier;

export { ConfectAuth } from "~/src/server/auth";
export {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "~/src/server/runners";
export { ConfectScheduler } from "~/src/server/scheduler";
export {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "~/src/server/storage";
