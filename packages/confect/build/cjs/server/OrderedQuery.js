const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_server_Document = require('./Document.js');
let effect = require("effect");

//#region src/server/OrderedQuery.ts
var OrderedQuery_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ make: () => make });
const make = (query, tableName, tableSchema) => {
	const streamEncoded = effect.Stream.fromAsyncIterable(query, effect.identity).pipe(effect.Stream.orDie);
	const stream = () => (0, effect.pipe)(streamEncoded, effect.Stream.mapEffect(require_server_Document.decode(tableName, tableSchema)));
	const first = () => (0, effect.pipe)(stream(), effect.Stream.take(1), effect.Stream.runHead);
	const take = (n) => (0, effect.pipe)(stream(), effect.Stream.take(n), effect.Stream.runCollect, effect.Effect.map((chunk) => effect.Chunk.toReadonlyArray(chunk)));
	const collect = () => (0, effect.pipe)(stream(), effect.Stream.runCollect, effect.Effect.map(effect.Chunk.toReadonlyArray));
	const paginate = (options) => effect.Effect.gen(function* () {
		const paginationResult = yield* effect.Effect.promise(() => query.paginate(options));
		return {
			page: yield* effect.Effect.forEach(paginationResult.page, require_server_Document.decode(tableName, tableSchema)),
			isDone: paginationResult.isDone,
			continueCursor: paginationResult.continueCursor,
			...paginationResult.splitCursor ? { splitCursor: paginationResult.splitCursor } : {},
			...paginationResult.pageStatus ? { pageStatus: paginationResult.pageStatus } : {}
		};
	});
	return {
		first,
		take,
		collect,
		paginate,
		stream
	};
};

//#endregion
Object.defineProperty(exports, 'OrderedQuery_exports', {
  enumerable: true,
  get: function () {
    return OrderedQuery_exports;
  }
});
exports.make = make;
//# sourceMappingURL=OrderedQuery.cjs.map