import type {
  ConfectDoc as ConfectDocType,
  TableNamesInConfectDataModel,
} from "~/src/server/data-model";
import { makeFunctions } from "~/src/server/functions";
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
} = makeFunctions(confectSchema);

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
export { ConfectScheduler } from "~/src/server/scheduler";
export {
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectStorageActionWriter,
} from "~/src/server/storage";
export {
  ConfectQueryRunner,
  ConfectMutationRunner,
  ConfectActionRunner,
} from "~/src/server/runners";
