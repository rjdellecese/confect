import { __export } from "../_virtual/rolldown_runtime.js";
import { getConvexFunctionName, getFunction } from "../api/Refs.js";
import { Context, Effect, Layer, Schema } from "effect";
import "convex/server";

//#region src/server/QueryRunner.ts
var QueryRunner_exports = /* @__PURE__ */ __export({
	QueryRunner: () => QueryRunner,
	layer: () => layer
});
const make = (runQuery) => (query, args) => Effect.gen(function* () {
	const function_ = getFunction(query);
	const functionName = getConvexFunctionName(query);
	const encodedArgs = yield* Schema.encode(function_.args)(args);
	const encodedReturns = yield* Effect.promise(() => runQuery(functionName, encodedArgs));
	return yield* Schema.decode(function_.returns)(encodedReturns);
});
const QueryRunner = Context.GenericTag("@rjdellecese/confect/server/QueryRunner");
const layer = (runQuery) => Layer.succeed(QueryRunner, make(runQuery));

//#endregion
export { QueryRunner, QueryRunner_exports, layer };
//# sourceMappingURL=QueryRunner.js.map