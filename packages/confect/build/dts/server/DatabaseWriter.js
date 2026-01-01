import { __export } from "../_virtual/rolldown_runtime.js";
import { encode } from "./Document.js";
import { getById } from "./QueryInitializer.js";
import { Context, Effect, Layer, Record, pipe } from "effect";

//#region src/server/DatabaseWriter.ts
var DatabaseWriter_exports = /* @__PURE__ */ __export({
	DatabaseWriter: () => DatabaseWriter,
	layer: () => layer,
	make: () => make
});
const make = (schema, convexDatabaseWriter) => {
	const insert = (tableName, document) => Effect.gen(function* () {
		const table = schema.tables[tableName];
		const encodedDocument = yield* encode(document, tableName, table.Fields);
		return yield* Effect.promise(() => convexDatabaseWriter.insert(tableName, encodedDocument));
	});
	const patch = (tableName, id, patchedValues) => Effect.gen(function* () {
		const table = schema.tables[tableName];
		const tableSchema = table.Fields;
		const originalDecodedDoc = yield* getById(tableName, convexDatabaseWriter, table)(id);
		const updatedEncodedDoc = yield* pipe(patchedValues, Record.reduce(originalDecodedDoc, (acc, value, key) => value === void 0 ? Record.remove(acc, key) : Record.set(acc, key, value)), encode(tableName, tableSchema));
		yield* Effect.promise(() => convexDatabaseWriter.replace(id, updatedEncodedDoc));
	});
	const replace = (tableName, id, value) => Effect.gen(function* () {
		const tableSchema = schema.tables[tableName].Fields;
		const updatedEncodedDoc = yield* encode(value, tableName, tableSchema);
		yield* Effect.promise(() => convexDatabaseWriter.replace(id, updatedEncodedDoc));
	});
	const delete_ = (_tableName, id) => Effect.promise(() => convexDatabaseWriter.delete(id));
	return {
		insert,
		patch,
		replace,
		delete: delete_
	};
};
const DatabaseWriter = () => Context.GenericTag("@rjdellecese/confect/server/DatabaseWriter");
const layer = (schema, convexDatabaseWriter) => Layer.succeed(DatabaseWriter(), make(schema, convexDatabaseWriter));

//#endregion
export { DatabaseWriter, DatabaseWriter_exports, layer, make };
//# sourceMappingURL=DatabaseWriter.js.map