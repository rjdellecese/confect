import type { TableNamesInConfectDataModel } from "~/src/data-model";
import * as confect from "~/src/index";
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
} = confect.functions.make(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
	confect.schema.ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

export type ConfectDoc<
	TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = confect.functions.ConfectDoc<ConfectDataModel, TableName>;

export type ConfectQueryCtx = confect.ctx.ConfectQueryCtx<ConfectDataModel>;

export type ConfectMutationCtx =
	confect.ctx.ConfectMutationCtx<ConfectDataModel>;

export type ConfectActionCtx = confect.ctx.ConfectActionCtx<ConfectDataModel>;
