const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_SystemFields = require('../api/SystemFields.js');
let effect = require("effect");

//#region src/server/Document.ts
var Document_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	DocumentDecodeError: () => DocumentDecodeError,
	DocumentEncodeError: () => DocumentEncodeError,
	decode: () => decode,
	documentErrorMessage: () => documentErrorMessage,
	encode: () => encode
});
const decode = effect.Function.dual(3, (self, tableName, tableSchema) => effect.Effect.gen(function* () {
	const TableSchemaWithSystemFields = require_api_SystemFields.extendWithSystemFields(tableName, tableSchema);
	const encodedDoc = self;
	return yield* (0, effect.pipe)(encodedDoc, effect.Schema.decode(TableSchemaWithSystemFields), effect.Effect.catchTag("ParseError", (parseError) => effect.Effect.gen(function* () {
		const formattedParseError = yield* effect.ParseResult.TreeFormatter.formatError(parseError);
		return yield* new DocumentDecodeError({
			tableName,
			id: encodedDoc._id,
			parseError: formattedParseError
		});
	})));
}));
const encode = effect.Function.dual(3, (self, tableName, tableSchema) => effect.Effect.gen(function* () {
	const decodedDoc = self;
	return yield* (0, effect.pipe)(decodedDoc, effect.Schema.encode(tableSchema), effect.Effect.catchTag("ParseError", (parseError) => effect.Effect.gen(function* () {
		const formattedParseError = yield* effect.ParseResult.TreeFormatter.formatError(parseError);
		return yield* new DocumentEncodeError({
			tableName,
			id: decodedDoc._id,
			parseError: formattedParseError
		});
	})));
}));
var DocumentDecodeError = class extends effect.Schema.TaggedError("DocumentDecodeError")("DocumentDecodeError", {
	tableName: effect.Schema.String,
	id: effect.Schema.String,
	parseError: effect.Schema.String
}) {
	get message() {
		return documentErrorMessage({
			id: this.id,
			tableName: this.tableName,
			message: `could not be decoded:\n\n${this.parseError}`
		});
	}
};
var DocumentEncodeError = class extends effect.Schema.TaggedError("DocumentEncodeError")("DocumentEncodeError", {
	tableName: effect.Schema.String,
	id: effect.Schema.String,
	parseError: effect.Schema.String
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
exports.DocumentDecodeError = DocumentDecodeError;
exports.DocumentEncodeError = DocumentEncodeError;
Object.defineProperty(exports, 'Document_exports', {
  enumerable: true,
  get: function () {
    return Document_exports;
  }
});
exports.decode = decode;
exports.documentErrorMessage = documentErrorMessage;
exports.encode = encode;
//# sourceMappingURL=Document.cjs.map