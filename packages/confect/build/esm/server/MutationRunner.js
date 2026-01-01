import { __export } from "../_virtual/rolldown_runtime.js";
import { getConvexFunctionName, getFunction } from "../api/Refs.js";
import { Context, Effect, Layer, Schema } from "effect";
import "convex/server";

//#region src/server/MutationRunner.ts
var MutationRunner_exports = /* @__PURE__ */ __export({
	MutationRollback: () => MutationRollback,
	MutationRunner: () => MutationRunner,
	layer: () => layer
});
const makeMutationRunner = (runMutation) => (mutation, args) => Effect.gen(function* () {
	const function_ = getFunction(mutation);
	const functionName = getConvexFunctionName(mutation);
	const encodedArgs = yield* Schema.encode(function_.args)(args);
	const encodedReturns = yield* Effect.promise(() => runMutation(functionName, encodedArgs));
	return yield* Schema.decode(function_.returns)(encodedReturns);
});
const MutationRunner = Context.GenericTag("@rjdellecese/confect/server/MutationRunner");
const layer = (runMutation) => Layer.succeed(MutationRunner, makeMutationRunner(runMutation));
var MutationRollback = class extends Schema.TaggedError("MutationRollback")("MutationRollback", {
	mutationName: Schema.String,
	error: Schema.Unknown
}) {
	/* v8 ignore start */
	get message() {
		return `Mutation ${this.mutationName} failed and was rolled back.\n\n${this.error}`;
	}
};

//#endregion
export { MutationRollback, MutationRunner, MutationRunner_exports, layer };
//# sourceMappingURL=MutationRunner.js.map