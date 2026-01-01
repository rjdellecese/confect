import { __export } from "../_virtual/rolldown_runtime.js";
import { extendWithSystemFields } from "../api/SystemFields.js";
import { Effect, Function, ParseResult, Schema, pipe } from "effect";

//#region src/server/Document.ts
var Document_exports = /* @__PURE__ */ __export({
	DocumentDecodeError: () => DocumentDecodeError,
	DocumentEncodeError: () => DocumentEncodeError,
	decode: () => decode,
	documentErrorMessage: () => documentErrorMessage,
	encode: () => encode
});
const decode = Function.dual(3, (self, tableName, tableSchema) => Effect.gen(function* () {
	const TableSchemaWithSystemFields = extendWithSystemFields(tableName, tableSchema);
	const encodedDoc = self;
	return yield* pipe(encodedDoc, Schema.decode(TableSchemaWithSystemFields), Effect.catchTag("ParseError", (parseError) => Effect.gen(function* () {
		const formattedParseError = yield* ParseResult.TreeFormatter.formatError(parseError);
		return yield* new DocumentDecodeError({
			tableName,
			id: encodedDoc._id,
			parseError: formattedParseError
		});
	})));
}));
const encode = Function.dual(3, (self, tableName, tableSchema) => Effect.gen(function* () {
	const decodedDoc = self;
	return yield* pipe(decodedDoc, Schema.encode(tableSchema), Effect.catchTag("ParseError", (parseError) => Effect.gen(function* () {
		const formattedParseError = yield* ParseResult.TreeFormatter.formatError(parseError);
		return yield* new DocumentEncodeError({
			tableName,
			id: decodedDoc._id,
			parseError: formattedParseError
		});
	})));
}));
var DocumentDecodeError = class extends Schema.TaggedError("DocumentDecodeError")("DocumentDecodeError", {
	tableName: Schema.String,
	id: Schema.String,
	parseError: Schema.String
}) {
	get message() {
		return documentErrorMessage({
			id: this.id,
			tableName: this.tableName,
			message: `could not be decoded:\n\n${this.parseError}`
		});
	}
};
var DocumentEncodeError = class extends Schema.TaggedError("DocumentEncodeError")("DocumentEncodeError", {
	tableName: Schema.String,
	id: Schema.String,
	parseError: Schema.String
}) {
	get message() {
		return documentErrorMessage({
			id: this.id,
			tableName: this.tableName,
			message: `could not be encoded:\n\n${this.parseError}`
		});
	}
};
const documentErrorMessage = ({ id, tableName, message }) => `Document with ID '${id}' in table '${tableName}' ${message}`;

//#endregion
export { DocumentDecodeError, DocumentEncodeError, Document_exports, decode, documentErrorMessage, encode };
//# sourceMappingURL=Document.js.map