import { Ref } from "@confect/core";
import type {
  OptimisticLocalStore,
  OptimisticUpdate,
} from "convex/browser";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
  type ReactMutation,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import { Cause, Effect, Either, Exit, Option } from "effect";

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

export interface ConfectOptimisticLocalStore {
  getQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Ref.Returns<Query> | undefined;

  getAllQueries<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
  ): Array<{
    args: Ref.Args<Query>;
    value: Ref.Returns<Query> | undefined;
  }>;

  setQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    args: Ref.Args<Query>,
    value: Ref.Returns<Query> | undefined,
  ): void;
}

export type ConfectOptimisticUpdate<Mutation extends Ref.AnyPublicMutation> = (
  localStore: ConfectOptimisticLocalStore,
  args: Ref.Args<Mutation>,
) => void;

export interface ConfectMutation<Mutation extends Ref.AnyPublicMutation> {
  (...args: Ref.OptionalArgs<Mutation>): InvokeReturn<Mutation>;
  withOptimisticUpdate(
    optimisticUpdate: ConfectOptimisticUpdate<Mutation>,
  ): ConfectMutation<Mutation>;
}

const wrapLocalStore = (
  localStore: OptimisticLocalStore,
): ConfectOptimisticLocalStore => ({
  getQuery: (queryRef, ...rest) => {
    const functionReference = Ref.getFunctionReference(
      queryRef,
    ) as FunctionReference<"query">;
    const args = (rest[0] ?? {}) as Ref.Args<typeof queryRef>;
    const encodedArgs = Ref.encodeArgsSync(queryRef, args) as Record<
      string,
      unknown
    >;
    const encoded = localStore.getQuery(functionReference, encodedArgs);
    return encoded === undefined
      ? undefined
      : Ref.decodeReturnsSync(queryRef, encoded);
  },
  setQuery: (queryRef, args, value) => {
    const functionReference = Ref.getFunctionReference(
      queryRef,
    ) as FunctionReference<"query">;
    const encodedArgs = Ref.encodeArgsSync(queryRef, args) as Record<
      string,
      unknown
    >;
    const encodedValue =
      value === undefined ? undefined : Ref.encodeReturnsSync(queryRef, value);
    localStore.setQuery(functionReference, encodedArgs, encodedValue);
  },
  getAllQueries: (queryRef) => {
    const functionReference = Ref.getFunctionReference(
      queryRef,
    ) as FunctionReference<"query">;
    return localStore.getAllQueries(functionReference).map(({ args, value }) => ({
      args: Ref.decodeArgsSync(queryRef, args),
      value:
        value === undefined ? undefined : Ref.decodeReturnsSync(queryRef, value),
    }));
  },
});

const makeConfectMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
  reactMutation: ReactMutation<
    Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
  >,
): ConfectMutation<Mutation> => {
  const callable = ((...args: Ref.OptionalArgs<Mutation>) =>
    invokeAsEither(
      ref,
      (_, encodedArgs) => reactMutation(encodedArgs as never),
      args,
    ).then((either) =>
      Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
    )) as (...args: Ref.OptionalArgs<Mutation>) => InvokeReturn<Mutation>;

  const withOptimisticUpdate = (
    optimisticUpdate: ConfectOptimisticUpdate<Mutation>,
  ): ConfectMutation<Mutation> => {
    const wrappedUpdate: OptimisticUpdate<never> = (localStore, encodedArgs) => {
      const decodedArgs = Ref.decodeArgsSync(ref, encodedArgs);
      optimisticUpdate(wrapLocalStore(localStore), decodedArgs);
    };
    const nextReactMutation = reactMutation.withOptimisticUpdate(
      wrappedUpdate as never,
    );
    return makeConfectMutation(ref, nextReactMutation);
  };

  return Object.assign(callable, { withOptimisticUpdate });
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
): ConfectMutation<Mutation> => {
  const functionReference = Ref.getFunctionReference(ref);
  const reactMutation = useConvexMutation(functionReference);
  return makeConfectMutation(
    ref,
    reactMutation as ReactMutation<
      Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
    >,
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

  return ((...args: Ref.OptionalArgs<Action>) =>
    invokeAsEither(
      ref,
      (_, encodedArgs) => actualAction(encodedArgs),
      args,
    ).then((either) =>
      Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
    )) as (...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>;
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
