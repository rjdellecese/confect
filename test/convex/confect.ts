import { confectServer } from "~/src";
import type {
	ConfectActionCtx as GenericConfectActionCtx,
	ConfectMutationCtx as GenericConfectMutationCtx,
	ConfectQueryCtx as GenericConfectQueryCtx,
} from "~/src/ctx";
import type { TableNamesInConfectDataModel } from "~/src/data-model";
import type { ConfectDataModelFromConfectSchemaDefinition } from "~/src/schema";
import type { ConfectDoc as GenericConfectDoc } from "~/src/server";
import { confectSchema } from "~/test/convex/schema";

// TODO: Generate this file!

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
	ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export const {
	action,
	httpAction,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} = confectServer(confectSchema);

export type ConfectDoc<
	TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = GenericConfectDoc<ConfectDataModel, TableName>;

export type ConfectQueryCtx = GenericConfectQueryCtx<ConfectDataModel>;

export type ConfectMutationCtx = GenericConfectMutationCtx<ConfectDataModel>;

export type ConfectActionCtx = GenericConfectActionCtx<ConfectDataModel>;
