import {
	ConfectActionCtx as ConfectActionCtxService,
	ConfectMutationCtx as ConfectMutationCtxService,
	ConfectQueryCtx as ConfectQueryCtxService,
	type ConfectActionCtx as ConfectActionCtxType,
	type ConfectMutationCtx as ConfectMutationCtxType,
	type ConfectQueryCtx as ConfectQueryCtxType,
} from "~/src/server/ctx";
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
