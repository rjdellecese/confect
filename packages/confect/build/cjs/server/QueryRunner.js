const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_Refs = require('../api/Refs.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/QueryRunner.ts
var QueryRunner_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	QueryRunner: () => QueryRunner,
	layer: () => layer
});
const make = (runQuery) => (query, args) => effect.Effect.gen(function* () {
	const function_ = require_api_Refs.getFunction(query);
	const functionName = require_api_Refs.getConvexFunctionName(query);
	const encodedArgs = yield* effect.Schema.encode(function_.args)(args);
	const encodedReturns = yield* effect.Effect.promise(() => runQuery(functionName, encodedArgs));
	return yield* effect.Schema.decode(function_.returns)(encodedReturns);
});
const QueryRunner = effect.Context.GenericTag("@rjdellecese/confect/server/QueryRunner");
const layer = (runQuery) => effect.Layer.succeed(QueryRunner, make(runQuery));

//#endregion
exports.QueryRunner = QueryRunner;
Object.defineProperty(exports, 'QueryRunner_exports', {
  enumerable: true,
  get: function () {
    return QueryRunner_exports;
  }
});
exports.layer = layer;
//# sourceMappingURL=QueryRunner.cjs.map