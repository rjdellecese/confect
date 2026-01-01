const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_api_Refs = require('../api/Refs.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/MutationRunner.ts
var MutationRunner_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	MutationRollback: () => MutationRollback,
	MutationRunner: () => MutationRunner,
	layer: () => layer
});
const makeMutationRunner = (runMutation) => (mutation, args) => effect.Effect.gen(function* () {
	const function_ = require_api_Refs.getFunction(mutation);
	const functionName = require_api_Refs.getConvexFunctionName(mutation);
	const encodedArgs = yield* effect.Schema.encode(function_.args)(args);
	const encodedReturns = yield* effect.Effect.promise(() => runMutation(functionName, encodedArgs));
	return yield* effect.Schema.decode(function_.returns)(encodedReturns);
});
const MutationRunner = effect.Context.GenericTag("@rjdellecese/confect/server/MutationRunner");
const layer = (runMutation) => effect.Layer.succeed(MutationRunner, makeMutationRunner(runMutation));
var MutationRollback = class extends effect.Schema.TaggedError("MutationRollback")("MutationRollback", {
	mutationName: effect.Schema.String,
	error: effect.Schema.Unknown
}) {
	/* v8 ignore start */
	get message() {
		return `Mutation ${this.mutationName} failed and was rolled back.\n\n${this.error}`;
	}
};

//#endregion
exports.MutationRollback = MutationRollback;
exports.MutationRunner = MutationRunner;
Object.defineProperty(exports, 'MutationRunner_exports', {
  enumerable: true,
  get: function () {
    return MutationRunner_exports;
  }
});
exports.layer = layer;
//# sourceMappingURL=MutationRunner.cjs.map