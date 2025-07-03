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
  ConvexAuth,
  ConfectAuth,
  ConvexScheduler,
  ConfectScheduler,
} = makeFunctions(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDocType<ConfectDataModel, TableName>;

export type ConfectDatabaseWriter = typeof ConfectDatabaseWriter.Service;

export type ConfectDatabaseReader = typeof ConfectDatabaseReader.Service;

export const ConfectActionCtx = ConfectActionCtxService<ConfectDataModel>();
export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;
