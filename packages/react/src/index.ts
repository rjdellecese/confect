import { Ref } from "@confect/core";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Cause, Effect, Either, Exit, Option } from "effect";
import { useCallback, useMemo } from "react";

import * as QueryResult from "./QueryResult";

export { QueryResult };

export type InvokeReturn<Ref_ extends Ref.Any> = [Ref.Error<Ref_>] extends [
  never,
]
  ? Promise<Ref.Returns<Ref_>>
  : Promise<Either.Either<Ref.Returns<Ref_>, Ref.Error<Ref_>>>;

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
  const skipped = args === "skip";
  const encodedArgs = skipped
    ? "skip"
    : Ref.encodeArgsSync(ref, (args ?? {}) as Ref.Args<Query>);

  // `useConvexQuery` returns a referentially stable value while the underlying
  // Convex result is unchanged, and throws a stable error when the query
  // fails. We capture either outcome as an `Either` and decode/wrap it inside
  // `useMemo` so that the returned `QueryResult` keeps a stable identity across
  // renders when nothing has actually changed. Decoding on every render would
  // hand consumers a fresh object each time, breaking effects and memoization
  // that depend on the result's identity.
  const encodedReturnsOrError: Either.Either<unknown, unknown> = Either.try(
    () => useConvexQuery(functionReference, encodedArgs),
  );

  return useMemo(
    () =>
      Either.match(encodedReturnsOrError, {
        onRight: (encodedReturnsOrUndefined) =>
          encodedReturnsOrUndefined === undefined
            ? QueryResult.load(skipped)
            : QueryResult.succeed(
                Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined),
              ),
        onLeft: (error) => {
          if (Ref.isConvexError(error)) {
            const decoded = Ref.decodeErrorSync(ref, error.data);
            if (Option.isSome(decoded)) {
              return QueryResult.fail(decoded.value);
            }
          }
          throw error;
        },
      }),
    // `Either.try` allocates a fresh wrapper each render, so we key the memo on
    // the stable value it carries (the Convex result or thrown error) rather
    // than the wrapper itself; the decoded result is a function of that value,
    // `ref`, and `skipped`.
    [ref, skipped, Either.merge(encodedReturnsOrError)],
  );
};

/**
 * Returns a function that invokes the provided `Ref`'s mutation.
 *
 * If the `Ref` declares an `error` schema, the returned promise resolves to an
 * `Either` with the decoded `returns` value on the right and the decoded error
 * on the left.
 *
 * If the `Ref` does not declare an `error` schema, the promise resolves
 * directly to the decoded `returns` value, matching the behavior of
 * `useMutation` from `convex/react`.
 *
 * Any other failure rejects the promise.
 */
export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
): ((...args: Ref.OptionalArgs<Mutation>) => InvokeReturn<Mutation>) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualMutation = useConvexMutation(functionReference);

  return useCallback(
    ((...args: Ref.OptionalArgs<Mutation>) =>
      invokeAsEither(
        ref,
        (_, encodedArgs) => actualMutation(encodedArgs),
        args,
      ).then((either) =>
        Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
      )) as (...args: Ref.OptionalArgs<Mutation>) => InvokeReturn<Mutation>,
    [ref, actualMutation],
  );
};

/**
 * Returns a function that invokes the provided `Ref`'s action.
 *
 * If the `Ref` declares an `error` schema, the returned promise resolves to an
 * `Either` with the decoded `returns` value on the right and the decoded error
 * on the left.
 *
 * If the `Ref` does not declare an `error` schema, the promise resolves
 * directly to the decoded `returns` value, matching the behavior of
 * `useMutation` from `convex/react`.
 *
 * Any other failure rejects the promise.
 */
export const useAction = <Action extends Ref.AnyPublicAction>(
  ref: Action,
): ((...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return useCallback(
    ((...args: Ref.OptionalArgs<Action>) =>
      invokeAsEither(
        ref,
        (_, encodedArgs) => actualAction(encodedArgs),
        args,
      ).then((either) =>
        Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
      )) as (...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>,
    [ref, actualAction],
  );
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
