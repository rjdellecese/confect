import {
	type ConfectActionCtx as ConfectActionCtxType,
	type ConfectMutationCtx as ConfectMutationCtxType,
	type ConfectQueryCtx as ConfectQueryCtxType,
	type ConfectDoc as ConfectDocType,
	type TableNamesInConfectDataModel,
	makeFunctions,
	type ConfectDataModelFromConfectSchemaDefinition,
} from "@rjdellecese/confect/server";

import { confectSchema } from "./schema";

export const {
	action,
	httpAction,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} = makeFunctions(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
	ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
	TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDocType<ConfectDataModel, TableName>;

export type ConfectQueryCtx = ConfectQueryCtxType<ConfectDataModel>;

export type ConfectMutationCtx = ConfectMutationCtxType<ConfectDataModel>;

export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;
