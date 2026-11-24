import { Ref } from "@confect/core";
import type { TypeError } from "@confect/core/Types";
import { version as convexVersion } from "convex";
import type { OptimisticUpdate as ConvexOptimisticUpdate } from "convex/browser";
import * as ConvexReact from "convex/react";
import type { usePaginatedQuery as useConvexPaginatedQuery } from "convex/react";
import {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQueries as useConvexQueries,
  useQuery as useConvexQuery,
} from "convex/react";
import type { ReactMutation as ConvexReactMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import { ConvexError, convexToJson } from "convex/values";
import type { Value } from "convex/values";
import * as Cause from "effect/Cause";
import * as Array from "effect/Array";
import * as String from "effect/String";
import * as Schema from "effect/Schema";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Exit from "effect/Exit";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { useCallback, useMemo, useState } from "react";

import * as OptimisticLocalStore from "./OptimisticLocalStore";
import * as PaginatedQueryResult from "./PaginatedQueryResult";
import * as QueryResult from "./QueryResult";
import * as StreamPagination from "./StreamPagination";
import type {
  PaginatedArgs as PaginatedQueryArgs,
  PaginatedItem as PaginatedQueryItem,
} from "@confect/core/Ref";

export type {
  /**
   * Decoded argument type for a paginated query, excluding the `paginationOpts`
   * supplied by the hook.
   *
   * @category Re-exports
   */
  PaginatedArgs as PaginatedQueryArgs,
  /**
   * Decoded item type for one element of a paginated query's `page`.
   *
   * @category Re-exports
   */
  PaginatedItem as PaginatedQueryItem,
} from "@confect/core/Ref";

const encodeJson = Schema.Unknown.pipe(
  Schema.fromJsonString,
  Schema.encodeResult,
);

export {
  /**
   * Cache interface and pagination helpers for applying optimistic mutation
   * updates to decoded query values.
   *
   * @category Re-exports
   */
  OptimisticLocalStore,
  /**
   * States, type guards, and matching helpers for a list loaded one page at a
   * time.
   *
   * @category Re-exports
   */
  PaginatedQueryResult,
  /**
   * States, type guards, and matching helpers for a reactive query result.
   *
   * @category Re-exports
   */
  QueryResult,
  /**
   * @internal
   */
  StreamPagination,
};

/**
 * Helpers for updating locally cached pages during an optimistic mutation.
 *
 * @category Re-exports
 */
export {
  /**
   * Updates decoded items across all loaded pages matching the query and its
   * user arguments.
   *
   * @category Re-exports
   */
  optimisticallyUpdateValueInPaginatedQuery,
  /**
   * Prepends a decoded item to the first matching initial page if it is loaded.
   *
   * @category Re-exports
   */
  insertAtTop,
  /**
   * Appends a decoded item to a matching loaded page only if that page reaches
   * the end of the query.
   *
   * @category Re-exports
   */
  insertAtBottomIfLoaded,
  /**
   * Inserts a decoded item into each matching pagination instance according to
   * the server's sort order.
   *
   * @category Re-exports
   */
  insertAtPosition,
} from "./OptimisticLocalStore";

/**
 * The promise returned by a mutation or action handle. It resolves directly to
 * the decoded value for a ref without a typed error, or to an Effect `Result`
 * when the function or its middleware declares an error.
 *
 * **Gotchas**
 *
 * Argument encoding, result decoding, and undeclared failures reject the
 * promise rather than producing a failed `Result`.
 *
 * @category Utility types
 */
export type InvokeReturn<Ref_ extends Ref.Any> = [Ref.Error<Ref_>] extends [
  never,
]
  ? Promise<Ref.Returns<Ref_>>
  : Promise<Result.Result<Ref.Returns<Ref_>, Ref.Error<Ref_>>>;

type UseQueryArgs<Query extends Ref.AnyPublicQuery> =
  keyof Ref.Args<Query> extends never
    ? [args?: Ref.Args<Query> | "skip"]
    : [args: Ref.Args<Query> | "skip"];

/**
 * Subscribes to a public query through the surrounding Convex React provider.
 * The result distinguishes a pending or skipped query from a decoded value or a
 * declared failure.
 *
 * **Details**
 *
 * The result keeps its identity across renders while the ref, underlying value
 * or error, and skipped state stay unchanged.
 *
 * @category Hooks
 *
 * @param ref - The public query ref, usually from generated `refs`.
 * @param rest - Decoded arguments, or `"skip"` to disable the subscription.
 *   Arguments may be omitted only for an argument-free query.
 *
 * @returns `Loading` until a value is available, `Success` with the decoded
 *   value, or `Failure` with a decoded declared error. A skipped query returns
 *   `Loading` with `skipped: true`, not a network request.
 *
 * @throws During render for argument/result codec failures, undeclared query
 *   failures, or missing Convex provider context. Handle these with an error
 *   boundary.
 */
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
  // fails. We capture either outcome as a `Result` and decode/wrap it inside
  // `useMemo` so that the returned `QueryResult` keeps a stable identity across
  // renders when nothing has actually changed. Decoding on every render would
  // hand consumers a fresh object each time, breaking effects and memoization
  // that depend on the result's identity.
  const encodedReturnsOrError: Result.Result<unknown, unknown> = Result.try(
    (): unknown => useConvexQuery(functionReference, encodedArgs),
  );
  const failed = Result.isFailure(encodedReturnsOrError);
  const value = Result.merge(encodedReturnsOrError);

  return useMemo(() => {
    if (!failed) {
      return value === undefined
        ? QueryResult.load(skipped)
        : QueryResult.succeed(Ref.decodeReturnsSync(ref, value));
    }
    if (Ref.isConvexError(value)) {
      const decoded = Ref.decodeErrorOption(ref, value.data);
      if (Option.isSome(decoded)) {
        return QueryResult.fail(decoded.value);
      }
    }
    throw value;
  }, [ref, skipped, failed, value]);
};

/**
 * Decoded user arguments for {@link usePaginatedQuery}, or `"skip"` to leave the
 * query unsubscribed. The hook supplies `paginationOpts`.
 *
 * @category Utility types
 */
export type UsePaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  | PaginatedQueryArgs<Query>
  | "skip";

/**
 * Options for {@link usePaginatedQuery}. Set `initialNumItems` to the number of
 * items to request for the first page; `loadMore(numItems)` sets the target for
 * each later page.
 *
 * @category Configuration
 */
export type PaginatedQueryOptions = Parameters<
  typeof useConvexPaginatedQuery
>[2];

/**
 * The `user`-facing result of `usePaginatedQueryInternal` from `convex/react`,
 * including the `"Error"` status its non-throwing mode can return.
 */
interface ConvexPaginatedQueryInternalUser {
  readonly results: ReadonlyArray<unknown>;
  readonly status:
    | "LoadingFirstPage"
    | "LoadingMore"
    | "CanLoadMore"
    | "Exhausted"
    | "Error";
  readonly isLoading: boolean;
  readonly loadMore: (numItems: number) => void;
  readonly error?: unknown;
}

type UseConvexPaginatedQueryInternal = (
  query: FunctionReference<"query">,
  args: Record<string, Value> | "skip",
  options: PaginatedQueryOptions,
  throwOnError: boolean,
) => { user: ConvexPaginatedQueryInternalUser };

// `usePaginatedQueryInternal` is runtime-exported by convex/react but absent
// from its public type declarations. It is the only way to observe query
// errors as values: the public positional `usePaginatedQuery` hard-codes
// throwOnError and throws mid-hook-sequence, which cannot be caught without
// breaking React's hook-order invariant.
const useConvexPaginatedQueryInternal =
  "usePaginatedQueryInternal" in ConvexReact
    ? (ConvexReact.usePaginatedQueryInternal as
        | UseConvexPaginatedQueryInternal
        | undefined)
    : undefined;

const minimumMajor = 1;
const minimumMinor = 36;
const MINIMUM_CONVEX_VERSION = `${minimumMajor}.${minimumMinor}.0`;

/**
 * The non-throwing mode of `usePaginatedQueryInternal`—its fourth,
 * `throwOnError` parameter—arrived in convex 1.36.0. Convex 1.32 through 1.35
 * export the same symbol taking only three parameters, where a fourth argument
 * is silently ignored and errors are always thrown.
 *
 * The function itself cannot be interrogated for this: `Function.length` counts
 * parameters up to the first one with a default, and 1.36.0 declares
 * `throwOnError = true`, so both shapes report an arity of 3. The package
 * version is the only reliable signal.
 */
const supportsErrorsAsValues = ((): boolean => {
  const [major, minor] = pipe(
    convexVersion,
    String.split("."),
    Array.map(Number),
  );
  if (
    major === undefined ||
    minor === undefined ||
    Number.isNaN(major) ||
    Number.isNaN(minor)
  ) {
    return false;
  }
  return (
    major > minimumMajor || (major === minimumMajor && minor >= minimumMinor)
  );
})();

/**
 * Subscribes to a paginated query through the Convex React provider and returns
 * its decoded items and loading state as a
 * {@link PaginatedQueryResult.PaginatedQueryResult}.
 *
 * **Details**
 *
 * The hook manages `paginationOpts` and decodes each item with the ref. Only
 * `CanLoadMore` exposes `loadMore`. A declared failure retains the items loaded
 * before the error.
 *
 * **Gotchas**
 *
 * This hook requires Convex 1.36.0 or newer, including when the query is
 * skipped.
 *
 * @category Hooks
 *
 * @param ref - A public paginated query ref; Confect refs must originate from
 *   `FunctionSpec.publicPaginatedQuery` to carry the user-args and item
 *   schemas.
 * @param args - Decoded user arguments without `paginationOpts`, or `"skip"` to
 *   disable subscriptions and return a skipped `LoadingFirstPage`.
 * @param options - The initial page size (`initialNumItems`).
 *
 * @returns The reactive pagination state and decoded items in query order.
 *
 * @throws During render for codec failures, undeclared query failures, invalid
 *   pagination options/refs, a missing Convex provider, or Convex older than
 *   1.36.0.
 *
 * @see {@link useStreamPaginatedQuery} for queries that use `QueryStream.paginate`.
 */
export const usePaginatedQuery = <Query extends Ref.AnyPublicPaginatedQuery>(
  ref: Query,
  args: UsePaginatedQueryArgs<Query>,
  options: PaginatedQueryOptions,
): PaginatedQueryResult.PaginatedQueryResult<
  PaginatedQueryItem<Query>,
  Ref.Error<Query>
> => {
  if (
    useConvexPaginatedQueryInternal === undefined ||
    !supportsErrorsAsValues
  ) {
    throw new Error(
      `usePaginatedQuery requires convex >= ${MINIMUM_CONVEX_VERSION}, but found ` +
        `${convexVersion}. Earlier versions always throw paginated query errors ` +
        "instead of returning them, so a declared `error` schema cannot be " +
        "surfaced as a `Failure`—upgrade the `convex` package.",
    );
  }

  const functionReference = Ref.getFunctionReference(ref);
  const skipped = args === "skip";

  // The encoded output is the wire form Convex's hook forwards verbatim, not
  // the ref's decoded args type.
  const encodedArgs = useMemo(
    () =>
      args === "skip"
        ? ("skip" as const)
        : (Ref.encodePaginatedQueryArgsSync(
            ref,
            args as unknown as Omit<Ref.Args<Query>, "paginationOpts">,
          ) as Record<string, Value>),
    [ref, args],
  );

  const { user: convexResult } = useConvexPaginatedQueryInternal(
    functionReference,
    encodedArgs,
    options,
    false,
  );

  // The Convex hook carries the pages loaded so far on every status,
  // failures included, so results are decoded unconditionally.
  //
  // Decoding allocates fresh items, so key on the referentially stable
  // `results` the Convex hook provides—the same identity-preservation
  // rationale as in `useQuery` above.
  const { results: encodedResults } = convexResult;
  const decodedResults = useMemo(
    () => Ref.decodePaginationPageSync(ref, encodedResults),
    [ref, encodedResults],
  );

  const { status, loadMore } = convexResult;
  const error = status === "Error" ? convexResult.error : undefined;

  return useMemo(
    (): PaginatedQueryResult.Variants<
      PaginatedQueryItem<Query>,
      Ref.Error<Query>
    > =>
      // `status` is a bare string union rather than a tagged one, so the arms
      // match on literals.
      Match.value(status).pipe(
        Match.when("Error", () => {
          if (Ref.isConvexError(error)) {
            const decoded = Ref.decodeErrorOption(ref, error.data);
            if (Option.isSome(decoded)) {
              return PaginatedQueryResult.failure({
                error: decoded.value,
                results: decodedResults,
              });
            }
          }
          // Unknown errors still throw. All hooks have run by this point, so
          // an aborted render here is hook-order-safe.
          throw error;
        }),
        Match.when("LoadingFirstPage", () =>
          PaginatedQueryResult.loadingFirstPage({ skipped }),
        ),
        Match.when("LoadingMore", () =>
          PaginatedQueryResult.loadingMore({ results: decodedResults }),
        ),
        // `CanLoadMore` is the only status whose `loadMore` does anything—the Convex hook returns an intentional no-op for all the others, so
        // they carry no callback at all.
        Match.when("CanLoadMore", () =>
          PaginatedQueryResult.canLoadMore({
            results: decodedResults,
            loadMore,
          }),
        ),
        Match.when("Exhausted", () =>
          PaginatedQueryResult.exhausted({ results: decodedResults }),
        ),
        Match.exhaustive,
      ),
    // The memo produces `Variants`, the conditional return type's superset—when `E` is `never` the `Failure` arm is unreachable at runtime, which
    // is exactly what the conditional encodes.
    [ref, skipped, decodedResults, status, loadMore, error],
  ) as PaginatedQueryResult.PaginatedQueryResult<
    PaginatedQueryItem<Query>,
    Ref.Error<Query>
  >;
};

/**
 * Whether a paginated query error means the stored cursors no longer match the
 * query (a data-dependent query changed underneath us), calling for a full
 * pagination reset rather than a failure.
 */
const isInvalidCursorError = (error: Error): boolean => {
  if (pipe(error.message, String.includes("InvalidCursor"))) {
    return true;
  }
  const data: unknown = error instanceof ConvexError ? error.data : undefined;
  return (
    typeof data === "object" &&
    data !== null &&
    // Both Convex's built-in pagination (which also sets
    // `isConvexSystemError`) and `QueryStream.paginate` signal an invalid
    // cursor with this data shape—the same check `convex/react` performs.
    "paginationError" in data &&
    data.paginationError === "InvalidCursor"
  );
};

const NO_ITEMS: ReadonlyArray<unknown> = [];

/**
 * Subscribes to a paginated query using fixed cursor ranges so adjacent pages
 * stay contiguous as their contents change. This hook is experimental.
 *
 * **When to use**
 *
 * Use with `QueryStream.paginate`, which does not write Convex's pagination
 * journal, or another query that honors `paginationOpts.endCursor`.
 *
 * **Details**
 *
 * The hook pins a loaded page by passing its `continueCursor` back as the end
 * of its range. It can split a page when the server supplies a split cursor and
 * the page exceeds the target size or the server requests a split.
 *
 * **Gotchas**
 *
 * Changing the query, encoded arguments, skipped state, initial page size, or
 * read budgets restarts at the first page. An `InvalidCursor` response also
 * restarts pagination instead of returning `Failure`. A server
 * `ReadBudgetExceededError` cannot be resolved by splitting; increase the
 * budget or reduce the reads.
 *
 * @category Hooks
 *
 * @param ref - A public paginated ref honoring `endCursor`; Confect refs must
 *   originate from `FunctionSpec.publicPaginatedQuery`.
 * @param args - Decoded user arguments without `paginationOpts`, or `"skip"` to
 *   disable page subscriptions.
 * @param options - The initial page size and optional per-page read budgets.
 *
 * @returns Reactive decoded items and pagination state. Declared query errors
 *   produce `Failure` with items retained from preceding pages. Each loaded
 *   page has its own subscription, released by the underlying hook when no
 *   longer used.
 *
 * @throws During render for codec failures, undeclared query failures, invalid
 *   refs, or a missing Convex provider.
 *
 * @see {@link usePaginatedQuery} for Convex's journal-backed pagination.
 */
export const useStreamPaginatedQuery = <
  Query extends Ref.AnyPublicPaginatedQuery,
>(
  ref: Query,
  args: UsePaginatedQueryArgs<Query>,
  options: {
    /**
     * Target item count for the first page and threshold for splitting growing
     * pages.
     *
     * @category Configuration
     */
    readonly initialNumItems: number;
    /**
     * Per-page row budget sent as `paginationOpts.maximumRowsRead`. A stream
     * query can return `SplitRequired` at a safe boundary or fail with
     * `ReadBudgetExceededError` if it cannot make progress. The budget does not
     * bound arbitrary reads in server callbacks.
     *
     * @category Configuration
     */
    readonly maximumRowsRead?: number;
    /**
     * Per-page byte-read budget forwarded as `paginationOpts.maximumBytesRead`.
     * Like the row budget, it can trigger a split or a
     * `ReadBudgetExceededError`; it does not guarantee that all Convex
     * execution limits are respected.
     *
     * @category Configuration
     */
    readonly maximumBytesRead?: number;
  },
): PaginatedQueryResult.PaginatedQueryResult<
  PaginatedQueryItem<Query>,
  Ref.Error<Query>
> => {
  // `useQueries` requires a *referentially stable* queries object while
  // nothing has changed: its subscription memo keys on identity, and its
  // `useSubscription` re-runs a render-phase state update whenever the
  // subscription changes—an unstable input loops the render. Callers
  // typically pass a fresh `args` literal each render, so everything that
  // feeds the queries object is stabilized by *value* here: the function
  // reference by `ref`, and the encoded args by their serialized form (as
  // `convex/react`'s own paginated hook does).
  const functionReference = useMemo(() => Ref.getFunctionReference(ref), [ref]);
  const skipped = args === "skip";

  const encodedArgs =
    args === "skip"
      ? undefined
      : (Ref.encodePaginatedQueryArgsSync(
          ref,
          args as unknown as Omit<Ref.Args<Query>, "paginationOpts">,
        ) as Record<string, Value>);
  const encodedArgsKey =
    encodedArgs === undefined
      ? "skip"
      : encodeJson(convexToJson(encodedArgs)).pipe(Result.getOrThrow);

  // A change of query, args, skippedness, or page size restarts pagination
  // from scratch.
  const resetKey = useMemo(
    () =>
      encodeJson([
        getFunctionName(functionReference),
        encodedArgsKey,
        options.initialNumItems,
        options.maximumRowsRead ?? null,
        options.maximumBytesRead ?? null,
      ]).pipe(Result.getOrThrow),
    [
      functionReference,
      encodedArgsKey,
      options.initialNumItems,
      options.maximumRowsRead,
      options.maximumBytesRead,
    ],
  );

  const freshState = () =>
    skipped
      ? StreamPagination.empty
      : StreamPagination.initial(options.initialNumItems, options);

  const [tracked, setTracked] = useState(() => ({
    encodedArgs,
    resetKey,
    state: freshState(),
  }));
  // Render-phase reset—the React-sanctioned derived-state-from-props
  // pattern, also how `convex/react`'s own paginated hook resets.
  let current = tracked;
  if (current.resetKey !== resetKey) {
    current = { encodedArgs, resetKey, state: freshState() };
    setTracked(current);
  }

  const applyTransitions = useCallback(
    (
      transitions: ReadonlyArray<
        (state: StreamPagination.State) => StreamPagination.State
      >,
    ) =>
      setTracked((previous) => ({
        ...previous,
        state: Array.reduce(transitions, previous.state, (state, transition) =>
          transition(state),
        ),
      })),
    [],
  );

  const queries = useMemo(
    () =>
      StreamPagination.pageRequests(current.state, (page) => ({
        query: functionReference,
        args: { ...current.encodedArgs, paginationOpts: page },
      })),
    [current.state, functionReference, current.encodedArgs],
  );

  const resultsObject = useConvexQueries(queries);

  const interpretation = useMemo(
    () =>
      StreamPagination.interpret(
        current.state,
        resultsObject as StreamPagination.Results,
        { initialNumItems: options.initialNumItems, isInvalidCursorError },
      ),
    [current.state, resultsObject, options.initialNumItems],
  );

  // Apply the transitions this render discovered (completed split swaps,
  // new splits of overgrown pages) or restart after an invalid cursor—render-phase state updates, as in `convex-helpers`' hook. Both settle:
  // the updated state no longer produces the same discovery.
  if (interpretation._tag === "ResetRequired") {
    setTracked((previous) => ({
      ...previous,
      state: freshState(),
    }));
  } else if (
    interpretation._tag === "Interpreted" &&
    interpretation.transitions.length > 0
  ) {
    applyTransitions(interpretation.transitions);
  }

  const encodedItems =
    interpretation._tag === "ResetRequired" ? NO_ITEMS : interpretation.items;
  // Page results keep their identity while unchanged (only the page that
  // actually updated is a fresh object), so caching decodes per encoded
  // item makes a single-page update decode only that page's items rather
  // than every loaded page's.
  const decodeItem = useMemo(() => {
    const decodeCache = new WeakMap<object, PaginatedQueryItem<Query>>();
    return (item: unknown): PaginatedQueryItem<Query> => {
      if (typeof item !== "object" || item === null) {
        return Ref.decodePaginationPageSync(ref, [item])[0];
      }
      const cached = decodeCache.get(item);
      if (cached !== undefined) {
        return cached;
      }
      const decoded: PaginatedQueryItem<Query> = Ref.decodePaginationPageSync(
        ref,
        [item],
      )[0];
      decodeCache.set(item, decoded);
      return decoded;
    };
  }, [ref]);
  const decodedResults = useMemo(
    () => Array.map(encodedItems, decodeItem),
    [encodedItems, decodeItem],
  );

  return useMemo((): PaginatedQueryResult.Variants<
    PaginatedQueryItem<Query>,
    Ref.Error<Query>
  > => {
    if (interpretation._tag === "ResetRequired") {
      return PaginatedQueryResult.loadingFirstPage({ skipped });
    }
    if (interpretation._tag === "Failed") {
      const error = interpretation.error;
      if (Ref.isConvexError(error)) {
        const decoded = Ref.decodeErrorOption(ref, error.data);
        if (Option.isSome(decoded)) {
          return PaginatedQueryResult.failure({
            error: decoded.value,
            results: decodedResults,
          });
        }
      }
      // Unknown errors still throw, to be caught by an error boundary.
      throw error;
    }

    const { lastResult } = interpretation;
    if (Option.isNone(lastResult) && current.state.pageKeys.length <= 1) {
      return PaginatedQueryResult.loadingFirstPage({ skipped });
    }
    if (
      Option.isNone(lastResult) ||
      StreamPagination.isLastPageSplitting(current.state)
    ) {
      return PaginatedQueryResult.loadingMore({ results: decodedResults });
    }
    if (lastResult.value.isDone) {
      return PaginatedQueryResult.exhausted({ results: decodedResults });
    }

    const continueCursor = lastResult.value.continueCursor;
    // A per-result guard, as in `convex-helpers`: calling `loadMore`
    // repeatedly before the next render is a single load.
    let alreadyLoadingMore = false;
    return PaginatedQueryResult.canLoadMore({
      results: decodedResults,
      loadMore: (numItems: number) => {
        if (!alreadyLoadingMore) {
          alreadyLoadingMore = true;
          applyTransitions([
            StreamPagination.loadMore(continueCursor, numItems, {
              maximumRowsRead: options.maximumRowsRead,
              maximumBytesRead: options.maximumBytesRead,
            }),
          ]);
        }
      },
    });
  }, [
    interpretation,
    decodedResults,
    current.state,
    skipped,
    ref,
    applyTransitions,
    options.maximumRowsRead,
    options.maximumBytesRead,
  ]) as PaginatedQueryResult.PaginatedQueryResult<
    PaginatedQueryItem<Query>,
    Ref.Error<Query>
  >;
};

/**
 * Callback that applies temporary changes to an
 * {@link OptimisticLocalStore.OptimisticLocalStore} using the mutation's
 * decoded arguments.
 *
 * **Gotchas**
 *
 * The callback must be synchronous. Convex may replay it when new query data
 * arrives, so avoid external side effects and do not retain the store for later
 * use.
 *
 * @category Optimistic updates
 *
 * @param localStore - The temporary client cache view; read decoded values and
 *   write replacements rather than mutating values obtained from the store.
 * @param args - The mutation's decoded arguments, not its wire representation.
 *
 * @returns Nothing. Convex rolls back temporary changes once the mutation
 *   completes.
 */
export type OptimisticUpdate<Mutation extends Ref.AnyPublicMutation> = (
  localStore: OptimisticLocalStore.OptimisticLocalStore,
  args: Ref.Args<Mutation>,
) => void;

/**
 * Callable mutation handle returned by {@link useMutation}. Call it with decoded
 * arguments, or use `withOptimisticUpdate` to create a handle that also changes
 * the local cache.
 *
 * @category Models
 */
export interface ReactMutation<Mutation extends Ref.AnyPublicMutation> {
  /**
   * Invokes the mutation with decoded arguments. Omit them only for an
   * argument-free ref. The promise follows {@link InvokeReturn}: undeclared and
   * codec failures reject it.
   *
   * @category Running
   */
  (...args: Ref.OptionalArgs<Mutation>): InvokeReturn<Mutation>;
  /**
   * Returns a new mutation handle with a synchronous optimistic callback. Call
   * the new handle to apply the update; the original handle stays unchanged.
   *
   * @category Optimistic updates
   *
   * @param optimisticUpdate - Receives a decoded cache view and decoded
   *   mutation arguments. May run more than once as Convex replays pending
   *   mutations.
   *
   * @returns A handle with the same invocation and failure contract. Temporary
   *   cache changes are rolled back when the mutation and query sync complete.
   *
   * @throws If an optimistic update is already configured on this handle.
   */
  withOptimisticUpdate<T extends OptimisticUpdate<Mutation>>(
    optimisticUpdate: T &
      (ReturnType<T> extends Promise<unknown>
        ? TypeError<"Optimistic update handlers must be synchronous">
        : unknown),
  ): ReactMutation<Mutation>;
}

const makeReactMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
  convexReactMutation: ConvexReactMutation<
    Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
  >,
): ReactMutation<Mutation> => {
  const callable = ((...args: Ref.OptionalArgs<Mutation>) =>
    invokeAsResult(
      ref,
      (_, encodedArgs) => convexReactMutation(encodedArgs as never),
      args,
    ).then((result) =>
      Ref.hasErrorSchema(ref) ? result : Result.getOrThrow(result),
    )) as (...args: Ref.OptionalArgs<Mutation>) => InvokeReturn<Mutation>;

  const withOptimisticUpdate = (
    optimisticUpdate: OptimisticUpdate<Mutation>,
  ): ReactMutation<Mutation> => {
    const wrappedUpdate: ConvexOptimisticUpdate<Record<string, Value>> = (
      convexLocalStore,
      encodedArgs,
    ) => {
      const decodedArgs = Ref.decodeArgsSync(ref, encodedArgs);
      optimisticUpdate(
        OptimisticLocalStore.make(convexLocalStore),
        decodedArgs,
      );
    };
    const nextConvexReactMutation =
      convexReactMutation.withOptimisticUpdate(wrappedUpdate);
    return makeReactMutation(ref, nextConvexReactMutation);
  };

  return Object.assign(callable, { withOptimisticUpdate });
};

/**
 * Returns a memoized {@link ReactMutation} for invoking a public mutation with
 * decoded arguments and optionally applying an optimistic update.
 *
 * **Details**
 *
 * Calling the handle resolves to a decoded value if the ref has no declared
 * error. If the function or its middleware declares an error, the promise
 * resolves to a `Result` containing the decoded value or declared failure.
 *
 * **Gotchas**
 *
 * Codec failures and undeclared failures reject the promise. They do not become
 * `Result` values.
 *
 * @category Hooks
 *
 * @param ref - The public mutation ref to invoke through the surrounding Convex
 *   provider. The returned handle accepts decoded arguments; omit them only for
 *   an argument-free mutation.
 *
 * @returns A callable handle, stable while the ref and underlying Convex handle
 *   are unchanged.
 *
 * @throws During render if the Convex provider is missing.
 *
 * @see {@link OptimisticUpdate} for the synchronous cache callback accepted by the handle.
 */
export const useMutation = <Mutation extends Ref.AnyPublicMutation>(
  ref: Mutation,
): ReactMutation<Mutation> => {
  const functionReference = Ref.getFunctionReference(ref);
  const convexReactMutation = useConvexMutation(functionReference);

  return useMemo(
    () =>
      makeReactMutation(
        ref,
        convexReactMutation as ConvexReactMutation<
          Ref.FunctionReference<Mutation> & FunctionReference<"mutation">
        >,
      ),
    [ref, convexReactMutation],
  );
};

/**
 * Returns a memoized function that invokes a public action with decoded
 * arguments through the surrounding Convex React provider.
 *
 * **Details**
 *
 * Calling the function resolves to a decoded value if the ref has no declared
 * error. If the action or its middleware declares an error, the promise
 * resolves to a `Result` containing the decoded value or declared failure.
 *
 * **Gotchas**
 *
 * Codec failures and undeclared failures reject the promise. Actions cannot
 * attach optimistic updates.
 *
 * @category Hooks
 *
 * @param ref - The public action ref to invoke through the surrounding Convex
 *   provider. The returned function accepts decoded arguments; omit them only
 *   for an argument-free action.
 *
 * @returns An invocation function that follows {@link InvokeReturn}.
 *
 * @throws During render if the Convex provider is missing.
 *
 * @see {@link useMutation} to invoke a mutation with an optimistic update.
 */
export const useAction = <Action extends Ref.AnyPublicAction>(
  ref: Action,
): ((...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>) => {
  const functionReference = Ref.getFunctionReference(ref);
  const actualAction = useConvexAction(functionReference);

  return useCallback(
    (...args: Ref.OptionalArgs<Action>) =>
      invokeAsResult(
        ref,
        (_, encodedArgs) => actualAction(encodedArgs),
        args,
      ).then((result) =>
        Ref.hasErrorSchema(ref) ? result : Result.getOrThrow(result),
      ) as InvokeReturn<Action>,
    [ref, actualAction],
  );
};

const invokeAsResult = <Ref_ extends Ref.Any>(
  ref: Ref_,
  invoke: Parameters<typeof Ref.runWithCodec<Ref_>>[2],
  args: Ref.OptionalArgs<Ref_>,
): Promise<Result.Result<Ref.Returns<Ref_>, Ref.Error<Ref_>>> => {
  const exitPromise = Effect.runPromiseExit(
    Ref.runWithCodec(ref, (args[0] ?? {}) as Ref.Args<Ref_>, invoke).pipe(
      Effect.catchTag("SchemaError", Effect.die),
      Effect.result,
    ),
  );
  return exitPromise.then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });
};
