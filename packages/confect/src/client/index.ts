import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Effect, Option, Schema } from "effect";
import * as Refs from "../api/Refs";

export const useQuery = <Query extends Refs.Ref.AnyPublicQuery>(
  ref: Query,
  args: Refs.Ref.Args<Query>["Type"],
): Option.Option<Refs.Ref.Returns<Query>["Type"]> => {
  const function_ = Refs.getFunction(ref);
  const functionName = Refs.getConvexFunctionName(ref);

  const encodedArgs = Schema.encodeSync(function_.args)(args);

  const encodedReturnsOrUndefined = useConvexQuery(
    functionName as any,
    encodedArgs,
  );

  if (encodedReturnsOrUndefined === undefined) {
    return Option.none();
  } else {
    return Option.some(
      Schema.decodeSync(function_.returns)(encodedReturnsOrUndefined),
    );
  }
};

export const useMutation = <Mutation extends Refs.Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const function_ = Refs.getFunction(ref);
  const functionName = Refs.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return (
    args: Refs.Ref.Args<Mutation>["Type"],
  ): Effect.Effect<Refs.Ref.Returns<Mutation>["Type"]> =>
    Effect.gen(function* () {
      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const actualReturns = yield* Effect.promise(() =>
        actualMutation(encodedArgs),
      );

      return yield* Schema.decode(function_.returns)(actualReturns);
    }).pipe(Effect.orDie);
};

export const useAction = <Action extends Refs.Ref.AnyPublicAction>(
  ref: Action,
) => {
  const function_ = Refs.getFunction(ref);
  const functionName = Refs.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return (
    args: Refs.Ref.Args<Action>["Type"],
  ): Effect.Effect<Refs.Ref.Returns<Action>["Type"]> =>
    Effect.gen(function* () {
      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const actualReturns = yield* Effect.promise(() =>
        actualAction(encodedArgs),
      );

      return yield* Schema.decode(function_.returns)(actualReturns);
    }).pipe(Effect.orDie);
};
