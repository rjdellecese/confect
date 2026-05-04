import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import type { Either } from "effect";
import { Cause, Effect, Exit, Option } from "effect";

import * as QueryResult from "./QueryResult";

export { QueryResult };

type UseQueryArgs<Query extends Ref.AnyPublicQuery> =
  keyof Ref.Args<Query> extends never
    ? [args?: Ref.Args<Query> | "skip"]
    : [args: Ref.Args<Query> | "skip"];

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  ...rest: UseQueryArgs<Query>
): QueryResult.QueryResult<Ref.Returns<Query>, Ref.Error<Query>> => {
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
      return QueryResult.load(args === "skip");
    }

    return QueryResult.succeed(
      Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined),
    );
  } catch (error) {
    if (Ref.isConvexError(error)) {
      const decoded = Ref.decodeErrorSync(ref, error.data);
      if (Option.isSome(decoded)) {
        return QueryResult.fail(decoded.value);
      }
    }
    throw error;
  }
};

/**
 * Returns a function that resolves to `Either.Right(decodedReturn)` on
 * success and `Either.Left(typedError)` when the function fails with a
 * `ConvexError` whose payload matches the ref's `error` schema. Anything
 * else — network failures, contract-violating `ConvexError`s on schema-less
 * refs, or args/returns schema decode failures — rejects the Promise with
 * the original error.
 */
export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualMutation = useConvexMutation(functionReference);

  return (
    ...args: Ref.OptionalArgs<Mutation>
  ): Promise<Either.Either<Ref.Returns<Mutation>, Ref.Error<Mutation>>> =>
    invokeAsEither(ref, (_, encodedArgs) => actualMutation(encodedArgs), args);
};

/**
 * Returns a function that resolves to `Either.Right(decodedReturn)` on
 * success and `Either.Left(typedError)` when the function fails with a
 * `ConvexError` whose payload matches the ref's `error` schema. Anything
 * else — network failures, contract-violating `ConvexError`s on schema-less
 * refs, or args/returns schema decode failures — rejects the Promise with
 * the original error.
 */
export const useAction = <Action extends Ref.AnyPublicAction>(ref: Action) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return (
    ...args: Ref.OptionalArgs<Action>
  ): Promise<Either.Either<Ref.Returns<Action>, Ref.Error<Action>>> =>
    invokeAsEither(ref, (_, encodedArgs) => actualAction(encodedArgs), args);
};

const invokeAsEither = async <Ref_ extends Ref.Any>(
  ref: Ref_,
  invoke: (
    fnRef: Ref.FunctionReference<Ref_>,
    encodedArgs: unknown,
  ) => PromiseLike<unknown>,
  args: Ref.OptionalArgs<Ref_>,
): Promise<Either.Either<Ref.Returns<Ref_>, Ref.Error<Ref_>>> => {
  const exit = await Effect.runPromiseExit(
    Ref.runWithCodec(ref, (args[0] ?? {}) as Ref.Args<Ref_>, invoke).pipe(
      Effect.catchTag("ParseError", Effect.die),
      Effect.either,
    ),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
