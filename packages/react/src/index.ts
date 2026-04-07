import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  args: Ref.Args<Query>,
): Ref.Returns<Query> | undefined => {
  const functionName = Ref.getConvexFunctionName(ref);
  const encodedArgs = Ref.encodeArgsSync(ref, args);

  const encodedReturnsOrUndefined = useConvexQuery(
    functionName as any,
    encodedArgs,
  );

  if (encodedReturnsOrUndefined === undefined) {
    return undefined;
  }

  return Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined);
};

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const functionName = Ref.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return (args: Ref.Args<Mutation>): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(ref, args);
    return actualMutation(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionName = Ref.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return (args: Ref.Args<Action>): Promise<Ref.Returns<Action>> => {
    const encodedArgs = Ref.encodeArgsSync(ref, args);
    return actualAction(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};
