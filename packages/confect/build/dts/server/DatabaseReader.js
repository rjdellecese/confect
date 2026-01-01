import { __export } from "../_virtual/rolldown_runtime.js";
import { make as make$1 } from "./QueryInitializer.js";
import { systemTables } from "./Table.js";
import { extendWithSystemTables } from "./DatabaseSchema.js";
import { Array, Context, Layer } from "effect";

//#region src/server/DatabaseReader.ts
var DatabaseReader_exports = /* @__PURE__ */ __export({
	DatabaseReader: () => DatabaseReader,
	layer: () => layer,
	make: () => make
});
const make = (schema, convexDatabaseReader) => {
	const extendedTables = extendWithSystemTables(schema.tables);
	return { table: (tableName) => {
		const table = Object.values(extendedTables).find((def) => def.name === tableName);
		const baseDatabaseReader = Array.some(Object.values(systemTables), (systemTableDef) => systemTableDef.name === tableName) ? {
			get: convexDatabaseReader.system.get,
			query: convexDatabaseReader.system.query
		} : {
			get: convexDatabaseReader.get,
			query: convexDatabaseReader.query
		};
		return make$1(tableName, baseDatabaseReader, table);
	} };
};
const DatabaseReader = () => Context.GenericTag("@rjdellecese/confect/server/DatabaseReader");
const layer = (schema, convexDatabaseReader) => Layer.succeed(DatabaseReader(), make(schema, convexDatabaseReader));

//#endregion
export { DatabaseReader, DatabaseReader_exports, layer, make };
//# sourceMappingURL=DatabaseReader.js.map