import { __export } from "../_virtual/rolldown_runtime.js";
import { decode } from "./Document.js";
import { Chunk, Effect, Stream, identity, pipe } from "effect";

//#region src/server/OrderedQuery.ts
var OrderedQuery_exports = /* @__PURE__ */ __export({ make: () => make });
const make = (query, tableName, tableSchema) => {
	const streamEncoded = Stream.fromAsyncIterable(query, identity).pipe(Stream.orDie);
	const stream = () => pipe(streamEncoded, Stream.mapEffect(decode(tableName, tableSchema)));
	const first = () => pipe(stream(), Stream.take(1), Stream.runHead);
	const take = (n) => pipe(stream(), Stream.take(n), Stream.runCollect, Effect.map((chunk) => Chunk.toReadonlyArray(chunk)));
	const collect = () => pipe(stream(), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));
	const paginate = (options) => Effect.gen(function* () {
		const paginationResult = yield* Effect.promise(() => query.paginate(options));
		return {
			page: yield* Effect.forEach(paginationResult.page, decode(tableName, tableSchema)),
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
export { OrderedQuery_exports, make };
//# sourceMappingURL=OrderedQuery.js.map