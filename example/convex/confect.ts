import type { TableNamesInConfectDataModel } from "@rjdellecese/confect/data-model";
import type { ConfectDataModelFromConfectSchemaDefinition } from "@rjdellecese/confect/schema";
import {
	make,
	type ConfectDoc as ConfectDocType,
} from "@rjdellecese/confect/functions";
import type {
	ConfectQueryCtx as ConfectQueryCtxType,
	ConfectMutationCtx as ConfectMutationCtxType,
	ConfectActionCtx as ConfectActionCtxType,
} from "@rjdellecese/confect/ctx";

import { confectSchema } from "./schema";

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
