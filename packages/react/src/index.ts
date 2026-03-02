import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Schema } from "effect";

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  args: Ref.Args<Query>["Type"],
): Ref.Returns<Query>["Type"] | undefined => {
  const function_ = Ref.getFunction(ref);
  const functionName = Ref.getConvexFunctionName(ref);

  const encodedArgs = Schema.encodeSync(function_.args)(args);

  const encodedReturnsOrUndefined = useConvexQuery(
    functionName as any,
    encodedArgs,
  );

  if (encodedReturnsOrUndefined === undefined) {
    return undefined;
  } else {
    return Schema.decodeSync(function_.returns)(encodedReturnsOrUndefined);
  }
};

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const function_ = Ref.getFunction(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return async (
    args: Ref.Args<Mutation>["Type"],
  ): Promise<Ref.Returns<Mutation>["Type"]> => {
    const encodedArgs = Schema.encodeSync(function_.args)(args);
    const actualReturns = await actualMutation(encodedArgs);
    return Schema.decodeSync(function_.returns)(actualReturns);
  };
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const function_ = Ref.getFunction(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return async (
    args: Ref.Args<Action>["Type"],
  ): Promise<Ref.Returns<Action>["Type"]> => {
    const encodedArgs = Schema.encodeSync(function_.args)(args);
    const actualReturns = await actualAction(encodedArgs);
    return Schema.decodeSync(function_.returns)(actualReturns);
  };
};
