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
import { useMemo } from "react";

type UseQueryArgs<Query extends Ref.AnyPublicQuery> =
  keyof Ref.Args<Query> extends never
    ? [args?: Ref.Args<Query> | "skip"]
    : [args: Ref.Args<Query> | "skip"];

export const useQuery = <Query extends Ref.AnyPublicQuery>(
  ref: Query,
  ...rest: UseQueryArgs<Query>
): Ref.Returns<Query> | undefined => {
  const functionReference = Ref.getFunctionReference(ref);
  const args = rest[0];
  const encodedArgs =
    args === "skip"
      ? "skip"
      : Ref.encodeArgsSync(ref, (args ?? {}) as Ref.Args<Query>);

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

  return (
    ...args: Ref.OptionalArgs<Mutation>
  ): Promise<Ref.Returns<Mutation>> => {
    const encodedArgs = Ref.encodeArgsSync(
      ref,
      (args[0] ?? {}) as Ref.Args<Mutation>,
    );
    return actualMutation(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
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
    return actualAction(encodedArgs).then((result) =>
      Ref.decodeReturnsSync(ref, result),
    );
  };
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
