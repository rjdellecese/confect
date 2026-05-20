import { Ref } from "@confect/core";
import type { UsePaginatedQueryResult } from "convex/react";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  usePaginatedQuery as useConvexPaginatedQuery,
  useQuery as useConvexQuery,
} from "convex/react";
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

/**
 * Convex's `usePaginatedQuery` removes the need for `paginationOpts` from the args.
 */
export type PaginatedQueryArgs<TQuery extends Ref.AnyPublicPaginatedQuery> =
  Omit<Ref.Args<TQuery>, "paginationOpts">;

/**
 * The item type for a paginated query.
 */
export type PaginatedQueryItem<TQuery extends Ref.AnyPublicPaginatedQuery> =
  Ref.Returns<TQuery>["page"][number];

/**
 * The args type for a paginated query.
 */
export type UsePaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  keyof Ref.Args<Query> extends never ? {} : PaginatedQueryArgs<Query> | "skip";

export type PaginatedQueryOptions = Parameters<
  typeof useConvexPaginatedQuery
>[2];

function getEncodedArgs<TPaginatedQuery extends Ref.AnyPublicPaginatedQuery>(
  ref: TPaginatedQuery,
  args: UsePaginatedQueryArgs<TPaginatedQuery>,
): "skip" | UsePaginatedQueryArgs<TPaginatedQuery> {
  if (args === "skip") {
    return "skip" as const;
  }
  const toEncode = {
    ...(args as PaginatedQueryArgs<TPaginatedQuery>),
    // `paginationOpts` are only added so that encoding arguments validate.
    // They aren't passed to the query function.
    paginationOpts: { numItems: 10, cursor: null },
  } as Ref.Args<TPaginatedQuery>;

  const encoded = Ref.encodeArgsSync(ref, toEncode);
  if (
    typeof encoded !== "object" ||
    encoded === null ||
    !("paginationOpts" in encoded)
  ) {
    throw new Error(
      "Encoded args is not an object or does not contain `paginationOpts`",
    );
  }
  const { paginationOpts: _paginationOpts, ...encodedArgs } = encoded;
  return encodedArgs as UsePaginatedQueryArgs<TPaginatedQuery>;
}

export const usePaginatedQuery = <
  TPaginatedQuery extends Ref.AnyPublicPaginatedQuery,
>(
  ref: TPaginatedQuery,
  args: UsePaginatedQueryArgs<TPaginatedQuery>,
  options: PaginatedQueryOptions,
): UsePaginatedQueryResult<PaginatedQueryItem<TPaginatedQuery>> => {
  const functionReference = Ref.getFunctionReference(ref);
  const encodedArgs = getEncodedArgs(ref, args);
  const { results, ...rest } = useConvexPaginatedQuery(
    functionReference,
    encodedArgs,
    options,
  );
  const decodedResults = Ref.decodePaginationPageSync(ref, results);
  return {
    results: decodedResults,
    ...rest,
  };
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

  return ((...args: Ref.OptionalArgs<Mutation>) =>
    invokeAsEither(
      ref,
      (_, encodedArgs) => actualMutation(encodedArgs),
      args,
    ).then((either) =>
      Ref.hasErrorSchema(ref) ? either : Either.getOrThrow(either),
    )) as (...args: Ref.OptionalArgs<Mutation>) => InvokeReturn<Mutation>;
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
