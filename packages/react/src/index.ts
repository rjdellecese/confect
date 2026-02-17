import * as Ref from "@confect/core/Ref";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Effect, Option, Schema } from "effect";

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  args: Ref.Args<Query>["Type"],
): Option.Option<Ref.Returns<Query>["Type"]> => {
  const function_ = Ref.getFunction(ref);
  const functionName = Ref.getConvexFunctionName(ref);

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

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const function_ = Ref.getFunction(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return (
    args: Ref.Args<Mutation>["Type"],
  ): Effect.Effect<Ref.Returns<Mutation>["Type"]> =>
    Effect.gen(function* () {
      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const actualReturns = yield* Effect.promise(() =>
        actualMutation(encodedArgs),
      );

      return yield* Schema.decode(function_.returns)(actualReturns);
    }).pipe(Effect.orDie);
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const function_ = Ref.getFunction(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return (
    args: Ref.Args<Action>["Type"],
  ): Effect.Effect<Ref.Returns<Action>["Type"]> =>
    Effect.gen(function* () {
      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const actualReturns = yield* Effect.promise(() =>
        actualAction(encodedArgs),
      );

      return yield* Schema.decode(function_.returns)(actualReturns);
    }).pipe(Effect.orDie);
};
