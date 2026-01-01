import { __export } from "../_virtual/rolldown_runtime.js";
import { decode, documentErrorMessage } from "./Document.js";
import { make as make$1 } from "./OrderedQuery.js";
import { Array, Effect, Either, Schema, pipe } from "effect";

//#region src/server/QueryInitializer.ts
var QueryInitializer_exports = /* @__PURE__ */ __export({
	GetByIdFailure: () => GetByIdFailure,
	GetByIndexFailure: () => GetByIndexFailure,
	getById: () => getById,
	make: () => make
});
const make = (tableName, convexDatabaseReader, table) => {
	const getByIndex = (indexName, indexFieldValues) => {
		const indexFields = table.indexes[indexName];
		return pipe(Effect.promise(() => convexDatabaseReader.query(tableName).withIndex(indexName, (q) => Array.reduce(indexFieldValues, q, (q_, v, i) => q_.eq(indexFields[i], v))).unique()), Effect.andThen(Either.fromNullable(() => new GetByIndexFailure({
			tableName,
			indexName,
			indexFieldValues
		}))), Effect.andThen(decode(tableName, table.Fields)));
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
		const orderedQuery = pipe(convexDatabaseReader.query(tableName), applyWithIndex, applyOrder);
		return make$1(orderedQuery, tableName, table.Fields);
	};
	const search = (indexName, searchFilter) => make$1(convexDatabaseReader.query(tableName).withSearchIndex(indexName, searchFilter), tableName, table.Fields);
	return {
		get,
		index,
		search
	};
};
const getById = (tableName, convexDatabaseReader, table) => (id) => pipe(Effect.promise(() => convexDatabaseReader.get(id)), Effect.andThen(Either.fromNullable(() => new GetByIdFailure({
	tableName,
	id
}))), Effect.andThen(decode(tableName, table.Fields)));
var GetByIdFailure = class extends Schema.TaggedError("GetByIdFailure")("GetByIdFailure", {
	id: Schema.String,
	tableName: Schema.String
}) {
	get message() {
		return documentErrorMessage({
			id: this.id,
			tableName: this.tableName,
			message: "not found"
		});
	}
};
var GetByIndexFailure = class extends Schema.TaggedError("GetByIndexFailure")("GetByIndexFailure", {
	tableName: Schema.String,
	indexName: Schema.String,
	indexFieldValues: Schema.Array(Schema.String)
}) {
	get message() {
		return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${this.indexFieldValues}'`;
	}
};

//#endregion
export { GetByIdFailure, GetByIndexFailure, QueryInitializer_exports, getById, make };
//# sourceMappingURL=QueryInitializer.js.map