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
  const function_ = Ref.getFunctionSpec(ref);
  const functionName = Ref.getConvexFunctionName(ref);

  const encodedArgs = Match.value(function_.functionProvenance).pipe(
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

  return Match.value(function_.functionProvenance).pipe(
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
  const function_ = Ref.getFunctionSpec(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualMutation = useConvexMutation(functionName as any);

  return async (args: Ref.Args<Mutation>): Promise<Ref.Returns<Mutation>> =>
    Match.value(function_.functionProvenance).pipe(
      Match.tag("Confect", async (confect) => {
        const encodedArgs = Schema.encodeSync(confect.args)(args);
        const actualReturns = await actualMutation(encodedArgs);
        return Schema.decodeSync(confect.returns)(actualReturns);
      }),
      Match.tag("Convex", () => actualMutation(args as any)),
      Match.exhaustive,
    );
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const function_ = Ref.getFunctionSpec(ref);
  const functionName = Ref.getConvexFunctionName(ref);
  const actualAction = useConvexAction(functionName as any);

  return async (args: Ref.Args<Action>): Promise<Ref.Returns<Action>> =>
    Match.value(function_.functionProvenance).pipe(
      Match.tag("Confect", async (confect) => {
        const encodedArgs = Schema.encodeSync(confect.args)(args);
        const actualReturns = await actualAction(encodedArgs);
        return Schema.decodeSync(confect.returns)(actualReturns);
      }),
      Match.tag("Convex", () => actualAction(args as any)),
      Match.exhaustive,
    );
};
