import { getConvexFunctionName, getFunction } from "../api/Refs.js";
import { Effect, Option, Schema } from "effect";
import { useAction as useAction$1, useMutation as useMutation$1, useQuery as useQuery$1 } from "convex/react";

//#region src/client/index.ts
const useQuery = (ref, args) => {
	const function_ = getFunction(ref);
	const encodedReturnsOrUndefined = useQuery$1(getConvexFunctionName(ref), Schema.encodeSync(function_.args)(args));
	if (encodedReturnsOrUndefined === void 0) return Option.none();
	else return Option.some(Schema.decodeSync(function_.returns)(encodedReturnsOrUndefined));
};
const useMutation = (ref) => {
	const function_ = getFunction(ref);
	const actualMutation = useMutation$1(getConvexFunctionName(ref));
	return (args) => Effect.gen(function* () {
		const encodedArgs = yield* Schema.encode(function_.args)(args);
		const actualReturns = yield* Effect.promise(() => actualMutation(encodedArgs));
		return yield* Schema.decode(function_.returns)(actualReturns);
	}).pipe(Effect.orDie);
};
const useAction = (ref) => {
	const function_ = getFunction(ref);
	const actualAction = useAction$1(getConvexFunctionName(ref));
	return (args) => Effect.gen(function* () {
		const encodedArgs = yield* Schema.encode(function_.args)(args);
		const actualReturns = yield* Effect.promise(() => actualAction(encodedArgs));
		return yield* Schema.decode(function_.returns)(actualReturns);
	}).pipe(Effect.orDie);
};

//#endregion
export { useAction, useMutation, useQuery };
//# sourceMappingURL=index.js.map