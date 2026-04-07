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
  const functionReference = Ref.getFunctionReference(ref);
  const encodedArgs = Ref.encodeArgsSync(ref, args);

  const encodedReturnsOrUndefined = useConvexQuery(
    functionReference as any,
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
  const functionReference = Ref.getFunctionReference(ref);
  const actualMutation = useConvexMutation(functionReference as any);

  return (args: Ref.Args<Mutation>): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(ref, args);
    return actualMutation(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference as any);

  return (args: Ref.Args<Action>): Promise<Ref.Returns<Action>> => {
    const encodedArgs = Ref.encodeArgsSync(ref, args);
    return actualAction(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};
