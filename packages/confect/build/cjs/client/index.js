const require_api_Refs = require('../api/Refs.js');
let effect = require("effect");
let convex_react = require("convex/react");

//#region src/client/index.ts
const useQuery = (ref, args) => {
	const function_ = require_api_Refs.getFunction(ref);
	const encodedReturnsOrUndefined = (0, convex_react.useQuery)(require_api_Refs.getConvexFunctionName(ref), effect.Schema.encodeSync(function_.args)(args));
	if (encodedReturnsOrUndefined === void 0) return effect.Option.none();
	else return effect.Option.some(effect.Schema.decodeSync(function_.returns)(encodedReturnsOrUndefined));
};
const useMutation = (ref) => {
	const function_ = require_api_Refs.getFunction(ref);
	const actualMutation = (0, convex_react.useMutation)(require_api_Refs.getConvexFunctionName(ref));
	return (args) => effect.Effect.gen(function* () {
		const encodedArgs = yield* effect.Schema.encode(function_.args)(args);
		const actualReturns = yield* effect.Effect.promise(() => actualMutation(encodedArgs));
		return yield* effect.Schema.decode(function_.returns)(actualReturns);
	}).pipe(effect.Effect.orDie);
};
const useAction = (ref) => {
	const function_ = require_api_Refs.getFunction(ref);
	const actualAction = (0, convex_react.useAction)(require_api_Refs.getConvexFunctionName(ref));
	return (args) => effect.Effect.gen(function* () {
		const encodedArgs = yield* effect.Schema.encode(function_.args)(args);
		const actualReturns = yield* effect.Effect.promise(() => actualAction(encodedArgs));
		return yield* effect.Schema.decode(function_.returns)(actualReturns);
	}).pipe(effect.Effect.orDie);
};

//#endregion
exports.useAction = useAction;
exports.useMutation = useMutation;
exports.useQuery = useQuery;
//# sourceMappingURL=index.cjs.map