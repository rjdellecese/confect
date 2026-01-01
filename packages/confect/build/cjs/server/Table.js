const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_SystemFields = require('../api/SystemFields.js');
const require_server_SchemaToValidator = require('./SchemaToValidator.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/Table.ts
var Table_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	isTable: () => isTable,
	make: () => make,
	scheduledFunctionsTable: () => scheduledFunctionsTable,
	storageTable: () => storageTable,
	systemTables: () => systemTables
});
const TypeId = "@rjdellecese/confect/server/Table";
const isTable = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = {
	[TypeId]: TypeId,
	index(name, fields) {
		return makeProto({
			name: this.name,
			Fields: this.Fields,
			Doc: this.Doc,
			tableDefinition: this.tableDefinition.index(name, fields),
			indexes: {
				...this.indexes,
				[name]: fields
			}
		});
	},
	searchIndex(name, indexConfig) {
		return makeProto({
			name: this.name,
			Fields: this.Fields,
			Doc: this.Doc,
			tableDefinition: this.tableDefinition.searchIndex(name, indexConfig),
			indexes: this.indexes
		});
	},
	vectorIndex(name, indexConfig) {
		return makeProto({
			name: this.name,
			Fields: this.Fields,
			Doc: this.Doc,
			tableDefinition: this.tableDefinition.vectorIndex(name, {
				vectorField: indexConfig.vectorField,
				dimensions: indexConfig.dimensions,
				...indexConfig.filterFields ? { filterFields: indexConfig.filterFields } : {}
			}),
			indexes: this.indexes
		});
	}
};
const makeProto = ({ name, Fields, Doc, tableDefinition, indexes }) => Object.assign(Object.create(Proto), {
	name,
	Fields,
	Doc,
	tableDefinition,
	indexes
});
/**
* Create a table.
*/
const make = (name, fields) => {
	const tableDefinition = (0, convex_server.defineTable)(require_server_SchemaToValidator.compileTableSchema(fields));
	return makeProto({
		name,
		Fields: fields,
		Doc: require_api_SystemFields.extendWithSystemFields(name, fields),
		tableDefinition,
		indexes: {}
	});
};
const scheduledFunctionsTable = make("_scheduled_functions", effect.Schema.Struct({
	name: effect.Schema.String,
	args: effect.Schema.Array(effect.Schema.Any),
	scheduledTime: effect.Schema.Number,
	completedTime: effect.Schema.optionalWith(effect.Schema.Number, { exact: true }),
	state: effect.Schema.Union(effect.Schema.Struct({ kind: effect.Schema.Literal("pending") }), effect.Schema.Struct({ kind: effect.Schema.Literal("inProgress") }), effect.Schema.Struct({ kind: effect.Schema.Literal("success") }), effect.Schema.Struct({
		kind: effect.Schema.Literal("failed"),
		error: effect.Schema.String
	}), effect.Schema.Struct({ kind: effect.Schema.Literal("canceled") }))
}));
const storageTable = make("_storage", effect.Schema.Struct({
	sha256: effect.Schema.String,
	size: effect.Schema.Number,
	contentType: effect.Schema.optionalWith(effect.Schema.String, { exact: true })
}));
const systemTables = {
	_scheduled_functions: scheduledFunctionsTable,
	_storage: storageTable
};

//#endregion
Object.defineProperty(exports, 'Table_exports', {
  enumerable: true,
  get: function () {
    return Table_exports;
  }
});
exports.TypeId = TypeId;
exports.isTable = isTable;
exports.make = make;
exports.scheduledFunctionsTable = scheduledFunctionsTable;
exports.storageTable = storageTable;
exports.systemTables = systemTables;
//# sourceMappingURL=Table.cjs.map