import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  args: Ref.Args<Query> | "skip",
): Ref.Returns<Query> | undefined => {
  const functionReference = Ref.getFunctionReference(ref);
  const encodedArgs = args === "skip" ? "skip" : Ref.encodeArgsSync(ref, args);

  const encodedReturnsOrUndefined = useConvexQuery(
    functionReference,
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
  const actualMutation = useConvexMutation(functionReference);

  return (args: Ref.Args<Mutation>): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(ref, args);
    return actualMutation(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return (args: Ref.Args<Action>): Promise<Ref.Returns<Action>> => {
    const encodedArgs = Ref.encodeArgsSync(ref, args);
    return actualAction(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
};
