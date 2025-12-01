import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Effect, Option, Schema } from "effect";
import { ConfectApiRefs } from "../api";

export const useQuery = <Query extends ConfectApiRefs.Ref.AnyPublicQuery>(
  ref: Query,
  args: ConfectApiRefs.Ref.Args<Query>["Type"],
): Option.Option<ConfectApiRefs.Ref.Returns<Query>["Type"]> => {
  const function_ = ConfectApiRefs.getFunction(ref);
  const functionName = ConfectApiRefs.getConvexFunctionName(ref);

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

export const useMutation = <
  Mutation extends ConfectApiRefs.Ref.AnyPublicMutation,
>(
  ref: Mutation,
) => {
  const function_ = ConfectApiRefs.getFunction(ref);
  const functionName = ConfectApiRefs.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return (
    args: ConfectApiRefs.Ref.Args<Mutation>["Type"],
  ): Effect.Effect<ConfectApiRefs.Ref.Returns<Mutation>["Type"]> =>
    Effect.gen(function* () {
      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const actualReturns = yield* Effect.promise(() =>
        actualMutation(encodedArgs),
      );

      return yield* Schema.decode(function_.returns)(actualReturns);
    }).pipe(Effect.orDie);
};

export const useAction = <Action extends ConfectApiRefs.Ref.AnyPublicAction>(
  ref: Action,
) => {
  const function_ = ConfectApiRefs.getFunction(ref);
  const functionName = ConfectApiRefs.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return (
    args: ConfectApiRefs.Ref.Args<Action>["Type"],
  ): Effect.Effect<ConfectApiRefs.Ref.Returns<Action>["Type"]> =>
    Effect.gen(function* () {
      const encodedArgs = yield* Schema.encode(function_.args)(args);

      const actualReturns = yield* Effect.promise(() =>
        actualAction(encodedArgs),
      );

      return yield* Schema.decode(function_.returns)(actualReturns);
    }).pipe(Effect.orDie);
};
