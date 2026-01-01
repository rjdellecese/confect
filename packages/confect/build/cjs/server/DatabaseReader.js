const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_server_QueryInitializer = require('./QueryInitializer.js');
const require_server_Table = require('./Table.js');
const require_server_DatabaseSchema = require('./DatabaseSchema.js');
let effect = require("effect");

//#region src/server/DatabaseReader.ts
var DatabaseReader_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	DatabaseReader: () => DatabaseReader,
	layer: () => layer,
	make: () => make
});
const make = (schema, convexDatabaseReader) => {
	const extendedTables = require_server_DatabaseSchema.extendWithSystemTables(schema.tables);
	return { table: (tableName) => {
		const table = Object.values(extendedTables).find((def) => def.name === tableName);
		const baseDatabaseReader = effect.Array.some(Object.values(require_server_Table.systemTables), (systemTableDef) => systemTableDef.name === tableName) ? {
			get: convexDatabaseReader.system.get,
			query: convexDatabaseReader.system.query
		} : {
			get: convexDatabaseReader.get,
			query: convexDatabaseReader.query
		};
		return require_server_QueryInitializer.make(tableName, baseDatabaseReader, table);
	} };
};
const DatabaseReader = () => effect.Context.GenericTag("@rjdellecese/confect/server/DatabaseReader");
const layer = (schema, convexDatabaseReader) => effect.Layer.succeed(DatabaseReader(), make(schema, convexDatabaseReader));

//#endregion
exports.DatabaseReader = DatabaseReader;
Object.defineProperty(exports, 'DatabaseReader_exports', {
  enumerable: true,
  get: function () {
    return DatabaseReader_exports;
  }
});
exports.layer = layer;
exports.make = make;
//# sourceMappingURL=DatabaseReader.cjs.map