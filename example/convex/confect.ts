import {
	ConfectActionCtx as ConfectActionCtxService,
	ConfectMutationCtx as ConfectMutationCtxService,
	ConfectQueryCtx as ConfectQueryCtxService,
	type ConfectActionCtx as ConfectActionCtxType,
	type ConfectDataModelFromConfectSchemaDefinition,
	type ConfectDoc as ConfectDocType,
	type ConfectMutationCtx as ConfectMutationCtxType,
	type ConfectQueryCtx as ConfectQueryCtxType,
	type TableNamesInConfectDataModel,
	makeFunctions,
} from "@rjdellecese/confect/server";

import { confectSchema } from "./schema";

export const {
	action,
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

export const ConfectQueryCtx = ConfectQueryCtxService<ConfectDataModel>();
export type ConfectQueryCtx = ConfectQueryCtxType<ConfectDataModel>;

export const ConfectMutationCtx = ConfectMutationCtxService<ConfectDataModel>();
export type ConfectMutationCtx = ConfectMutationCtxType<ConfectDataModel>;

export const ConfectActionCtx = ConfectActionCtxService<ConfectDataModel>();
export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;
