const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_Refs = require('../api/Refs.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/ActionRunner.ts
var ActionRunner_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	ActionRunner: () => ActionRunner,
	layer: () => layer
});
const makeActionRunner = (runAction) => (action, args) => effect.Effect.gen(function* () {
	const function_ = require_api_Refs.getFunction(action);
	const functionName = require_api_Refs.getConvexFunctionName(action);
	const encodedArgs = yield* effect.Schema.encode(function_.args)(args);
	const encodedReturns = yield* effect.Effect.promise(() => runAction(functionName, encodedArgs));
	return yield* effect.Schema.decode(function_.returns)(encodedReturns);
});
const ActionRunner = effect.Context.GenericTag("@rjdellecese/confect/server/ActionRunner");
const layer = (runAction) => effect.Layer.succeed(ActionRunner, makeActionRunner(runAction));

//#endregion
exports.ActionRunner = ActionRunner;
Object.defineProperty(exports, 'ActionRunner_exports', {
  enumerable: true,
  get: function () {
    return ActionRunner_exports;
  }
});
exports.layer = layer;
//# sourceMappingURL=ActionRunner.cjs.map