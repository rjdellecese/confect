import { Ref } from "@confect/core";
import * as Result_ from "@effect-atom/atom/Result";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";

export * as Result from "@effect-atom/atom/Result";

type UseQueryArgs<Query extends Ref.AnyPublicQuery> =
  keyof Ref.Args<Query> extends never
    ? [args?: Ref.Args<Query> | "skip"]
    : [args: Ref.Args<Query> | "skip"];

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  ...rest: UseQueryArgs<Query>
): Result_.Result<Ref.Returns<Query>, Ref.Error<Query>> => {
  const functionReference = Ref.getFunctionReference(ref);
  const args = rest[0];
  const encodedArgs =
    args === "skip"
      ? "skip"
      : Ref.encodeArgsSync(ref, (args ?? {}) as Ref.Args<Query>);

  try {
    const encodedReturnsOrUndefined = useConvexQuery(
      functionReference,
      encodedArgs,
    );

    if (encodedReturnsOrUndefined === undefined) {
      return Result_.initial(true);
    }

    return Result_.success(
      Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined),
    );
  } catch (error) {
    return Result_.failure(Ref.causeOfCaughtError(ref, error));
  }
};

export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualMutation = useConvexMutation(functionReference);

  return (
    ...args: Ref.OptionalArgs<Mutation>
  ): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Mutation>,
    );
    return actualMutation(encodedArgs)
      .then((result) => Ref.decodeReturnsSync(ref, result))
      .catch((error) => {
        throw Ref.maybeDecodeErrorSync(ref, error);
      });
  };
};

export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return (...args: Ref.OptionalArgs<Action>): Promise<Ref.Returns<Action>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Action>,
    );
    return actualAction(encodedArgs)
      .then((result) => Ref.decodeReturnsSync(ref, result))
      .catch((error) => {
        throw Ref.maybeDecodeErrorSync(ref, error);
      });
  };
};
