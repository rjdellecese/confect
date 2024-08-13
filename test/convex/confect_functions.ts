import { confectServer } from "~/src";
import type { TableNamesInConfectSchemaDefinition } from "~/src/schema";
import type { ConfectDoc as CDoc } from "~/src/server";
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
} = confectServer(confectSchema);

export type ConfectDoc<
	TableName extends TableNamesInConfectSchemaDefinition<typeof confectSchema>,
> = CDoc<typeof confectSchema, TableName>;
