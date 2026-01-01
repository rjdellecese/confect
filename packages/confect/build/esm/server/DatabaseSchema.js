import { __export } from "../_virtual/rolldown_runtime.js";
import { scheduledFunctionsTable, storageTable, systemTables } from "./Table.js";
import { Array, Predicate, Record, pipe } from "effect";
import { defineSchema } from "convex/server";

//#region src/server/DatabaseSchema.ts
var DatabaseSchema_exports = /* @__PURE__ */ __export({
	TypeId: () => TypeId,
	extendWithSystemTables: () => extendWithSystemTables,
	isSchema: () => isSchema,
	make: () => make,
	systemSchema: () => systemSchema
});
const TypeId = "@rjdellecese/confect/server/Schema";
const isSchema = (u) => Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	addTable(table) {
		const newTablesArray = [...Object.values(this.tables), table];
		return makeProto({
			tables: Record.set(this.tables, table.name, table),
			convexSchemaDefinition: pipe(newTablesArray, Array.map(({ name, tableDefinition }) => [name, tableDefinition]), Record.fromEntries, defineSchema)
		});
	}
};
const makeProto = ({ tables, convexSchemaDefinition }) => Object.assign(Object.create(Proto), {
	tables,
	convexSchemaDefinition
});
/**
* Create an empty schema definition. Add tables incrementally via `addTable`.
*/
const make = () => makeProto({
	tables: Record.empty(),
	convexSchemaDefinition: defineSchema({})
});
const systemSchema = make().addTable(scheduledFunctionsTable).addTable(storageTable);
const extendWithSystemTables = (tables) => ({
	...tables,
	...systemTables
});

//#endregion
export { DatabaseSchema_exports, TypeId, extendWithSystemTables, isSchema, make, systemSchema };
//# sourceMappingURL=DatabaseSchema.js.map