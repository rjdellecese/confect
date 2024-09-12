import type {
	ConfectActionCtx as ConfectActionCtxType,
	ConfectMutationCtx as ConfectMutationCtxType,
	ConfectQueryCtx as ConfectQueryCtxType,
} from "~/src/ctx";
import type { TableNamesInConfectDataModel } from "~/src/data-model";
import { type ConfectDoc as ConfectDocType, make } from "~/src/functions";
import type { ConfectDataModelFromConfectSchemaDefinition } from "~/src/schema";
import { confectSchema } from "~/test/convex/schema";

// TODO: Generate this file!

export const {
	action,
	httpAction,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} = make(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
	ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
	TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDocType<ConfectDataModel, TableName>;

export type ConfectQueryCtx = ConfectQueryCtxType<ConfectDataModel>;

export type ConfectMutationCtx = ConfectMutationCtxType<ConfectDataModel>;

export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;
