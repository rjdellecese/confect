import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Match, Schema } from "effect";

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  args: Ref.Args<Query>,
): Ref.Returns<Query> | undefined => {
  const functionSpec = Ref.getFunctionSpec(ref);
  const functionName = Ref.getConvexFunctionName(ref);

  const encodedArgs = Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confect) => Schema.encodeSync(confect.args)(args)),
    Match.tag("Convex", () => args),
    Match.exhaustive,
  );

  const encodedReturnsOrUndefined = useConvexQuery(
    functionName as any,
    encodedArgs,
  );

  if (encodedReturnsOrUndefined === undefined) {
    return undefined;
  }

  return Match.value(functionSpec.functionProvenance).pipe(
    Match.tag("Confect", (confect) =>
      Schema.decodeSync(confect.returns)(encodedReturnsOrUndefined),
    ),
    Match.tag("Convex", () => encodedReturnsOrUndefined),
    Match.exhaustive,
  );
};

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const functionSpec = Ref.getFunctionSpec(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return (args: Ref.Args<Mutation>): Promise<Ref.Returns<Mutation>> =>
    Match.value(functionSpec.functionProvenance).pipe(
      Match.tag("Confect", (confect) => {
        const encodedArgs = Schema.encodeSync(confect.args)(args);
        return actualMutation(encodedArgs).then((result) =>
          Schema.decodeSync(confect.returns)(result),
        );
      }),
      Match.tag("Convex", () => actualMutation(args as any)),
      Match.exhaustive,
    );
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionSpec = Ref.getFunctionSpec(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return (args: Ref.Args<Action>): Promise<Ref.Returns<Action>> =>
    Match.value(functionSpec.functionProvenance).pipe(
      Match.tag("Confect", (confect) => {
        const encodedArgs = Schema.encodeSync(confect.args)(args);
        return actualAction(encodedArgs).then((result) =>
          Schema.decodeSync(confect.returns)(result),
        );
      }),
      Match.tag("Convex", () => actualAction(args as any)),
      Match.exhaustive,
    );
};
