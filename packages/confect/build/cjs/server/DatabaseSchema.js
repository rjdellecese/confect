const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_server_Table = require('./Table.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/DatabaseSchema.ts
var DatabaseSchema_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	extendWithSystemTables: () => extendWithSystemTables,
	isSchema: () => isSchema,
	make: () => make,
	systemSchema: () => systemSchema
});
const TypeId = "@rjdellecese/confect/server/Schema";
const isSchema = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	addTable(table) {
		const newTablesArray = [...Object.values(this.tables), table];
		return makeProto({
			tables: effect.Record.set(this.tables, table.name, table),
			convexSchemaDefinition: (0, effect.pipe)(newTablesArray, effect.Array.map(({ name, tableDefinition }) => [name, tableDefinition]), effect.Record.fromEntries, convex_server.defineSchema)
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
	tables: effect.Record.empty(),
	convexSchemaDefinition: (0, convex_server.defineSchema)({})
});
const systemSchema = make().addTable(require_server_Table.scheduledFunctionsTable).addTable(require_server_Table.storageTable);
const extendWithSystemTables = (tables) => ({
	...tables,
	...require_server_Table.systemTables
});

//#endregion
Object.defineProperty(exports, 'DatabaseSchema_exports', {
  enumerable: true,
  get: function () {
    return DatabaseSchema_exports;
  }
});
exports.TypeId = TypeId;
exports.extendWithSystemTables = extendWithSystemTables;
exports.isSchema = isSchema;
exports.make = make;
exports.systemSchema = systemSchema;
//# sourceMappingURL=DatabaseSchema.cjs.map