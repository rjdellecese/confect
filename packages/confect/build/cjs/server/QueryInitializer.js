const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_server_Document = require('./Document.js');
const require_server_OrderedQuery = require('./OrderedQuery.js');
let effect = require("effect");

//#region src/server/QueryInitializer.ts
var QueryInitializer_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	GetByIdFailure: () => GetByIdFailure,
	GetByIndexFailure: () => GetByIndexFailure,
	getById: () => getById,
	make: () => make
});
const make = (tableName, convexDatabaseReader, table) => {
	const getByIndex = (indexName, indexFieldValues) => {
		const indexFields = table.indexes[indexName];
		return (0, effect.pipe)(effect.Effect.promise(() => convexDatabaseReader.query(tableName).withIndex(indexName, (q) => effect.Array.reduce(indexFieldValues, q, (q_, v, i) => q_.eq(indexFields[i], v))).unique()), effect.Effect.andThen(effect.Either.fromNullable(() => new GetByIndexFailure({
			tableName,
			indexName,
			indexFieldValues
		}))), effect.Effect.andThen(require_server_Document.decode(tableName, table.Fields)));
	};
	const get = ((...args) => {
		if (args.length === 1) {
			const id = args[0];
			return getById(tableName, convexDatabaseReader, table)(id);
		} else {
			const [indexName, ...indexFieldValues] = args;
			return getByIndex(indexName, indexFieldValues);
		}
	});
	const index = (indexName, indexRangeOrOrder, order) => {
		const { applyWithIndex, applyOrder } = indexRangeOrOrder === void 0 ? {
			applyWithIndex: (q) => q.withIndex(indexName),
			applyOrder: (q) => q.order("asc")
		} : typeof indexRangeOrOrder === "function" ? order === void 0 ? {
			applyWithIndex: (q) => q.withIndex(indexName, indexRangeOrOrder),
			applyOrder: (q) => q.order("asc")
		} : {
			applyWithIndex: (q) => q.withIndex(indexName, indexRangeOrOrder),
			applyOrder: (q) => q.order(order)
		} : {
			applyWithIndex: (q) => q.withIndex(indexName),
			applyOrder: (q) => q.order(indexRangeOrOrder)
		};
		const orderedQuery = (0, effect.pipe)(convexDatabaseReader.query(tableName), applyWithIndex, applyOrder);
		return require_server_OrderedQuery.make(orderedQuery, tableName, table.Fields);
	};
	const search = (indexName, searchFilter) => require_server_OrderedQuery.make(convexDatabaseReader.query(tableName).withSearchIndex(indexName, searchFilter), tableName, table.Fields);
	return {
		get,
		index,
		search
	};
};
const getById = (tableName, convexDatabaseReader, table) => (id) => (0, effect.pipe)(effect.Effect.promise(() => convexDatabaseReader.get(id)), effect.Effect.andThen(effect.Either.fromNullable(() => new GetByIdFailure({
	tableName,
	id
}))), effect.Effect.andThen(require_server_Document.decode(tableName, table.Fields)));
var GetByIdFailure = class extends effect.Schema.TaggedError("GetByIdFailure")("GetByIdFailure", {
	id: effect.Schema.String,
	tableName: effect.Schema.String
}) {
	get message() {
		return require_server_Document.documentErrorMessage({
			id: this.id,
			tableName: this.tableName,
			message: "not found"
		});
	}
};
var GetByIndexFailure = class extends effect.Schema.TaggedError("GetByIndexFailure")("GetByIndexFailure", {
	tableName: effect.Schema.String,
	indexName: effect.Schema.String,
	indexFieldValues: effect.Schema.Array(effect.Schema.String)
}) {
	get message() {
		return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${this.indexFieldValues}'`;
	}
};

//#endregion
exports.GetByIdFailure = GetByIdFailure;
exports.GetByIndexFailure = GetByIndexFailure;
Object.defineProperty(exports, 'QueryInitializer_exports', {
  enumerable: true,
  get: function () {
    return QueryInitializer_exports;
  }
});
exports.getById = getById;
exports.make = make;
//# sourceMappingURL=QueryInitializer.cjs.map