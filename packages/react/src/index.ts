import { Ref } from "@confect/core";
import type {
  FunctionReference as ConvexFunctionReference,
  PaginationOptions as ConvexPaginationOptions,
  PaginationResult as ConvexPaginationResult,
} from "convex/server";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  usePaginatedQuery as useConvexPaginatedQuery,
  useQuery as useConvexQuery,
} from "convex/react";
import { Cause, Effect, Either, Exit, Option } from "effect";
import { useMemo } from "react";

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

/**
 * The minimum shape of a paginated query result, used to constrain the return
 * type of refs that can be passed to {@link usePaginatedQuery}.
 */
type PaginationResultShape<Item> = {
  readonly page: ReadonlyArray<Item>;
  readonly isDone: boolean;
  readonly continueCursor: string;
};

/**
 * A Confect ref that is usable with {@link usePaginatedQuery}.
 *
 * The ref must:
 * - Refer to a public query.
 * - Have an arg named `paginationOpts` whose schema decodes to a value
 *   compatible with Convex's
 *   [`PaginationOptions`](https://docs.convex.dev/api/interfaces/server.PaginationOptions).
 *   The provided `PaginationOptions.PaginationOptions` schema from
 *   `@confect/core` satisfies this.
 * - Have a return type that decodes to a value compatible with Convex's
 *   [`PaginationResult`](https://docs.convex.dev/api/interfaces/server.PaginationResult).
 *   The provided `PaginationResult.PaginationResult(Item)` schema factory from
 *   `@confect/core` satisfies this.
 */
export interface PaginatedQueryRef<
  Args extends { paginationOpts: ConvexPaginationOptions } = {
    paginationOpts: ConvexPaginationOptions;
  },
  Item = any,
> extends Ref.Ref<any, "public", Args, PaginationResultShape<Item>> {}

/**
 * Given a {@link PaginatedQueryRef}, the type of the args object accepted by
 * {@link usePaginatedQuery}, with the `paginationOpts` argument removed.
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryRef> = Omit<
  Ref.Args<Query>,
  "paginationOpts"
>;

/**
 * Given a {@link PaginatedQueryRef}, the type of a single item being paginated
 * over.
 */
export type PaginatedQueryItem<Query extends PaginatedQueryRef> =
  Ref.Returns<Query> extends PaginationResultShape<infer Item> ? Item : never;

/**
 * The result returned by {@link usePaginatedQuery}.
 *
 * Mirrors Convex's `UsePaginatedQueryResult` but uses the decoded item type
 * derived from the ref's `returns` schema.
 */
export type UsePaginatedQueryResult<Query extends PaginatedQueryRef> = {
  results: PaginatedQueryItem<Query>[];
  loadMore: (numItems: number) => void;
} & (
  | { status: "LoadingFirstPage"; isLoading: true }
  | { status: "CanLoadMore"; isLoading: false }
  | { status: "LoadingMore"; isLoading: true }
  | { status: "Exhausted"; isLoading: false }
);

type UsePaginatedQueryArgs<Query extends PaginatedQueryRef> =
  keyof PaginatedQueryArgs<Query> extends never
    ? [
        args?: PaginatedQueryArgs<Query> | "skip",
        options?: { initialNumItems: number },
      ]
    : [
        args: PaginatedQueryArgs<Query> | "skip",
        options: { initialNumItems: number },
      ];

const STUB_PAGINATION_OPTS: ConvexPaginationOptions = {
  numItems: 0,
  cursor: null,
};

/**
 * Load data reactively from a Confect-paginated query to create a growing list.
 *
 * This is the Confect analogue of Convex's
 * [`usePaginatedQuery`](https://docs.convex.dev/api/modules/react#usepaginatedquery).
 * It works exactly the same way, but accepts a Confect ref and automatically
 * encodes args and decodes page items through the spec's Effect Schemas.
 *
 * The ref must reference a public query whose args include
 * `paginationOpts: PaginationOptions.PaginationOptions` and whose return type
 * is `PaginationResult.PaginationResult(Item)`.
 *
 * @param ref - A Confect ref to the public paginated query.
 * @param args - The args object for the query, excluding `paginationOpts`
 *   (which this hook injects). Pass `"skip"` to disable the subscription.
 * @param options - An object specifying the `initialNumItems` to load in the
 *   first page.
 */
export const usePaginatedQuery = <Query extends PaginatedQueryRef>(
  ref: Query,
  ...rest: UsePaginatedQueryArgs<Query>
): UsePaginatedQueryResult<Query> => {
  const functionReference = Ref.getFunctionReference(
    ref,
  ) as unknown as ConvexFunctionReference<
    "query",
    "public",
    { paginationOpts: ConvexPaginationOptions } & Record<string, unknown>,
    ConvexPaginationResult<unknown>
  >;

  const args = rest[0];
  const options = rest[1] ?? { initialNumItems: 0 };

  const encodedArgs = useMemo(() => {
    if (args === "skip") return "skip" as const;
    const userArgs = (args ?? {}) as PaginatedQueryArgs<Query>;
    const fullEncoded = Ref.encodeArgsSync(ref, {
      ...userArgs,
      paginationOpts: STUB_PAGINATION_OPTS,
    } as unknown as Ref.Args<Query>) as Record<string, unknown>;
    const { paginationOpts: _paginationOpts, ...withoutPaginationOpts } =
      fullEncoded;
    return withoutPaginationOpts;
  }, [ref, args]);

  const result = useConvexPaginatedQuery(
    functionReference,
    encodedArgs as Record<string, unknown> | "skip",
    options,
  );

  const decodedResults = useMemo(() => {
    if (result.results.length === 0) {
      return result.results as PaginatedQueryItem<Query>[];
    }
    const decoded = Ref.decodeReturnsSync(ref, {
      page: result.results,
      isDone: false,
      continueCursor: "",
    }) as PaginationResultShape<PaginatedQueryItem<Query>>;
    return decoded.page as PaginatedQueryItem<Query>[];
  }, [ref, result.results]);

  return {
    ...result,
    results: decodedResults,
  } as UsePaginatedQueryResult<Query>;
};
