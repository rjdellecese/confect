import {
	useQuery as useConvexQuery,
	useMutation as useConvexMutation,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import { Schema } from "@effect/schema";
import { Effect, Option } from "effect";

export const useQuery =
	<Query extends FunctionReference<"query">, Args, Returns>({
		query,
		args,
		returns,
	}: {
		query: Query;
		args: Schema.Schema<Args, Query["_args"]>;
		returns: Schema.Schema<Returns, Query["_returnType"]>;
	}) =>
	(actualArgs: Args): Option.Option<Returns> => {
		const encodedArgs = Schema.encodeSync(args)(actualArgs);

		const actualReturnsOrUndefined = useConvexQuery(query, encodedArgs);

		if (actualReturnsOrUndefined === undefined) {
			return Option.none();
		} else {
			const decodedReturns = Schema.decodeSync(returns)(
				actualReturnsOrUndefined,
			);

			return Option.some(decodedReturns);
		}
	};

export const useMutation = <
	Mutation extends FunctionReference<"mutation">,
	Args,
	Returns,
>({
	mutation,
	args,
	returns,
}: {
	mutation: Mutation;
	args: Schema.Schema<Args, Mutation["_args"]>;
	returns: Schema.Schema<Returns, Mutation["_returnType"]>;
}) => {
	const actualMutation = useConvexMutation(mutation);

	return (actualArgs: Args): Effect.Effect<Returns> =>
		Effect.gen(function* () {
			const encodedArgs = yield* Schema.encode(args)(actualArgs);

			const actualReturns = yield* Effect.promise(() =>
				actualMutation(encodedArgs),
			);

			return yield* Schema.decode(returns)(actualReturns);
		}).pipe(Effect.orDie);
};
