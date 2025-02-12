import type { GenericId } from "convex/values";
import type { SystemTableNames } from "convex/server";
import {
	ConfectActionCtx as ConfectActionCtxService,
	type ConfectActionCtx as ConfectActionCtxType,
	type ConfectDataModelFromConfectSchemaDefinition,
	type ConfectDoc as ConfectDocType,
	ConfectMutationCtx as ConfectMutationCtxService,
	type ConfectMutationCtx as ConfectMutationCtxType,
	ConfectQueryCtx as ConfectQueryCtxService,
	type ConfectQueryCtx as ConfectQueryCtxType,
	type TableNamesInConfectDataModel,
	Id as ConfectId,
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

export const Id = <
	TableName extends
		| TableNamesInConfectDataModel<ConfectDataModel>
		| SystemTableNames,
>(
	tableName: TableName,
) => ConfectId.Id(tableName);

export type Id<
	TableName extends
		| TableNamesInConfectDataModel<ConfectDataModel>
		| SystemTableNames,
> = GenericId<TableName>;

export const ConfectQueryCtx = ConfectQueryCtxService<ConfectDataModel>();
export type ConfectQueryCtx = ConfectQueryCtxType<ConfectDataModel>;

export const ConfectMutationCtx = ConfectMutationCtxService<ConfectDataModel>();
export type ConfectMutationCtx = ConfectMutationCtxType<ConfectDataModel>;

export const ConfectActionCtx = ConfectActionCtxService<ConfectDataModel>();
export type ConfectActionCtx = ConfectActionCtxType<ConfectDataModel>;
