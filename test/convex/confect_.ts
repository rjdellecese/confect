import {
  ConfectActionCtx as ConfectActionCtxService,
  type ConfectActionCtx as ConfectActionCtxType,
} from "~/src/server/ctx_";
import type {
  ConfectDoc as ConfectDocType,
  TableNamesInConfectDataModel,
} from "~/src/server/data-model";
import { makeFunctions } from "~/src/server/functions_";
import type { ConfectDataModelFromConfectSchemaDefinition } from "~/src/server/schema";
import { confectSchema } from "~/test/convex/schema";

export const {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  ConvexDatabaseReader,
  ConfectDatabaseReader,
  ConvexDatabaseWriter,
  ConfectDatabaseWriter,
  ConfectAuth,
  ConfectScheduler,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectStorageActionWriter,
  ConfectQueryRunner,
  ConfectMutationRunner,
  ConfectActionRunner,
} = makeFunctions(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDocType<ConfectDataModel, TableName>;

export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Identifier;

export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Identifier;

export const ConfectActionCtx = ConfectActionCtxService<ConfectDataModel>();
export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;

export type ConfectAuth = typeof ConfectAuth.Identifier;

export type ConfectScheduler = typeof ConfectScheduler.Identifier;

export type ConfectStorageReader = typeof ConfectStorageReader.Identifier;
export type ConfectStorageWriter = typeof ConfectStorageWriter.Identifier;
export type ConfectStorageActionWriter =
  typeof ConfectStorageActionWriter.Identifier;

export type ConfectQueryRunner = typeof ConfectQueryRunner.Identifier;
export type ConfectMutationRunner = typeof ConfectMutationRunner.Identifier;
export type ConfectActionRunner = typeof ConfectActionRunner.Identifier;
