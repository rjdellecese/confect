import { __export } from "../_virtual/rolldown_runtime.js";
import { getConvexFunctionName, getFunction } from "../api/Refs.js";
import { Context, Effect, Layer, Schema } from "effect";
import "convex/server";

//#region src/server/ActionRunner.ts
var ActionRunner_exports = /* @__PURE__ */ __export({
	ActionRunner: () => ActionRunner,
	layer: () => layer
});
const makeActionRunner = (runAction) => (action, args) => Effect.gen(function* () {
	const function_ = getFunction(action);
	const functionName = getConvexFunctionName(action);
	const encodedArgs = yield* Schema.encode(function_.args)(args);
	const encodedReturns = yield* Effect.promise(() => runAction(functionName, encodedArgs));
	return yield* Schema.decode(function_.returns)(encodedReturns);
});
const ActionRunner = Context.GenericTag("@rjdellecese/confect/server/ActionRunner");
const layer = (runAction) => Layer.succeed(ActionRunner, makeActionRunner(runAction));

//#endregion
export { ActionRunner, ActionRunner_exports, layer };
//# sourceMappingURL=ActionRunner.js.map