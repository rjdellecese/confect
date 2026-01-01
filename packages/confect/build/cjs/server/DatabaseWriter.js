const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_server_Document = require('./Document.js');
const require_server_QueryInitializer = require('./QueryInitializer.js');
let effect = require("effect");

//#region src/server/DatabaseWriter.ts
var DatabaseWriter_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	DatabaseWriter: () => DatabaseWriter,
	layer: () => layer,
	make: () => make
});
const make = (schema, convexDatabaseWriter) => {
	const insert = (tableName, document) => effect.Effect.gen(function* () {
		const table = schema.tables[tableName];
		const encodedDocument = yield* require_server_Document.encode(document, tableName, table.Fields);
		return yield* effect.Effect.promise(() => convexDatabaseWriter.insert(tableName, encodedDocument));
	});
	const patch = (tableName, id, patchedValues) => effect.Effect.gen(function* () {
		const table = schema.tables[tableName];
		const tableSchema = table.Fields;
		const originalDecodedDoc = yield* require_server_QueryInitializer.getById(tableName, convexDatabaseWriter, table)(id);
		const updatedEncodedDoc = yield* (0, effect.pipe)(patchedValues, effect.Record.reduce(originalDecodedDoc, (acc, value, key) => value === void 0 ? effect.Record.remove(acc, key) : effect.Record.set(acc, key, value)), require_server_Document.encode(tableName, tableSchema));
		yield* effect.Effect.promise(() => convexDatabaseWriter.replace(id, updatedEncodedDoc));
	});
	const replace = (tableName, id, value) => effect.Effect.gen(function* () {
		const tableSchema = schema.tables[tableName].Fields;
		const updatedEncodedDoc = yield* require_server_Document.encode(value, tableName, tableSchema);
		yield* effect.Effect.promise(() => convexDatabaseWriter.replace(id, updatedEncodedDoc));
	});
	const delete_ = (_tableName, id) => effect.Effect.promise(() => convexDatabaseWriter.delete(id));
	return {
		insert,
		patch,
		replace,
		delete: delete_
	};
};
const DatabaseWriter = () => effect.Context.GenericTag("@rjdellecese/confect/server/DatabaseWriter");
const layer = (schema, convexDatabaseWriter) => effect.Layer.succeed(DatabaseWriter(), make(schema, convexDatabaseWriter));

//#endregion
exports.DatabaseWriter = DatabaseWriter;
Object.defineProperty(exports, 'DatabaseWriter_exports', {
  enumerable: true,
  get: function () {
    return DatabaseWriter_exports;
  }
});
exports.layer = layer;
exports.make = make;
//# sourceMappingURL=DatabaseWriter.cjs.map