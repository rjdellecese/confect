import { __export } from "../_virtual/rolldown_runtime.js";
import { extendWithSystemFields } from "../api/SystemFields.js";
import { compileTableSchema } from "./SchemaToValidator.js";
import { Predicate, Schema } from "effect";
import { defineTable } from "convex/server";

//#region src/server/Table.ts
var Table_exports = /* @__PURE__ */ __export({
	TypeId: () => TypeId,
	isTable: () => isTable,
	make: () => make,
	scheduledFunctionsTable: () => scheduledFunctionsTable,
	storageTable: () => storageTable,
	systemTables: () => systemTables
});
const TypeId = "@rjdellecese/confect/server/Table";
const isTable = (u) => Predicate.hasProperty(u, TypeId);
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
	const tableDefinition = defineTable(compileTableSchema(fields));
	return makeProto({
		name,
		Fields: fields,
		Doc: extendWithSystemFields(name, fields),
		tableDefinition,
		indexes: {}
	});
};
const scheduledFunctionsTable = make("_scheduled_functions", Schema.Struct({
	name: Schema.String,
	args: Schema.Array(Schema.Any),
	scheduledTime: Schema.Number,
	completedTime: Schema.optionalWith(Schema.Number, { exact: true }),
	state: Schema.Union(Schema.Struct({ kind: Schema.Literal("pending") }), Schema.Struct({ kind: Schema.Literal("inProgress") }), Schema.Struct({ kind: Schema.Literal("success") }), Schema.Struct({
		kind: Schema.Literal("failed"),
		error: Schema.String
	}), Schema.Struct({ kind: Schema.Literal("canceled") }))
}));
const storageTable = make("_storage", Schema.Struct({
	sha256: Schema.String,
	size: Schema.Number,
	contentType: Schema.optionalWith(Schema.String, { exact: true })
}));
const systemTables = {
	_scheduled_functions: scheduledFunctionsTable,
	_storage: storageTable
};

//#endregion
export { Table_exports, TypeId, isTable, make, scheduledFunctionsTable, storageTable, systemTables };
//# sourceMappingURL=Table.js.map