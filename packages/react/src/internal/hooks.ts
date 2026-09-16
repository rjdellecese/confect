import { Ref } from "@confect/core";
import type { OptimisticUpdate as ConvexOptimisticUpdate } from "convex/browser";
import type { usePaginatedQuery as useConvexPaginatedQuery } from "convex/react";
import type {
  useAction as useConvexAction,
  useMutation as useConvexMutation,
  useQueries as useConvexQueries,
  useQuery as useConvexQuery,
  ReactMutation as ConvexReactMutation,
} from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError, convexToJson, type Value } from "convex/values";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Exit from "effect/Exit";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import { useCallback, useMemo, useState } from "react";

import * as OptimisticLocalStore from "../OptimisticLocalStore";
import * as PaginatedQueryResult from "../PaginatedQueryResult";
import * as QueryResult from "../QueryResult";
import * as StreamPagination from "../StreamPagination";

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
 * Like `Omit`, but implemented with key remapping so that optional modifiers
 * are preserved and index signatures don't reintroduce the omitted key's
 * literal type. Mirrors `BetterOmit` from `convex/server`.
 */
type OmitKey<T, K extends PropertyKey> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};

/**
 * The args accepted by {@link usePaginatedQuery}: the ref's args without
 * `paginationOpts`, which the underlying Convex hook manages itself. When no
 * args remain, resolves to `Record<string, never>` (only the empty object is
 * accepted) rather than `{}`, which would accept any non-nullish value.
 */
export type PaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  OmitKey<Ref.Args<Query>, "paginationOpts"> extends infer Args_
    ? keyof Args_ extends never
      ? Record<string, never>
      : Args_
    : never;

/**
 * The item type for a paginated query: the element type of the `page` field of
 * the ref's returns.
 */
export type PaginatedQueryItem<Query extends Ref.AnyPublicPaginatedQuery> =
  Ref.Returns<Query>["page"][number];

/**
 * The args parameter of {@link usePaginatedQuery}: the ref's args without
 * `paginationOpts`, or `"skip"` to skip the query.
 */
export type UsePaginatedQueryArgs<Query extends Ref.AnyPublicPaginatedQuery> =
  | PaginatedQueryArgs<Query>
  | "skip";

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

/**
 * An optimistic update for a Confect mutation. Mirrors Convex's
 * `OptimisticUpdate`, but receives a Confect {@link OptimisticLocalStore} and
 * the decoded mutation `args`.
 */
export type OptimisticUpdate<Mutation extends Ref.AnyPublicMutation> = (
  localStore: OptimisticLocalStore.OptimisticLocalStore,
  args: Ref.Args<Mutation>,
) => void;

/**
 * The handle returned by {@link useMutation}. It is callable like the function
 * returned by Convex's `useMutation`, and additionally exposes
 * `withOptimisticUpdate` for attaching an optimistic update. Mirrors the
 * `ReactMutation` type from `convex/react`.
 */
export interface ReactMutation<Mutation extends Ref.AnyPublicMutation> {
  (...args: Ref.OptionalArgs<Mutation>): InvokeReturn<Mutation>;
  withOptimisticUpdate(
    optimisticUpdate: OptimisticUpdate<Mutation>,
  ): ReactMutation<Mutation>;
}

export interface ConvexHooks {
  readonly convexVersion: string;
  readonly useQuery: typeof useConvexQuery;
  readonly useMutation: typeof useConvexMutation;
  readonly useAction: typeof useConvexAction;
  readonly useQueries: typeof useConvexQueries;
  readonly usePaginatedQueryInternal:
    | UseConvexPaginatedQueryInternal
    | undefined;
}

export const createHooks = ({
  convexVersion,
  useQuery: useConvexQuery,
  useMutation: useConvexMutation,
  useAction: useConvexAction,
  useQueries: useConvexQueries,
  usePaginatedQueryInternal: useConvexPaginatedQueryInternal,
}: ConvexHooks) => {
  const useQuery = <Query extends Ref.AnyPublicQuery>(
    ref: Query,
    ...rest: UseQueryArgs<Query>
  ): QueryResult.QueryResult<Ref.Returns<Query>, Ref.Error<Query>> => {
    const functionReference = Ref.getFunctionReference(ref);
    const args = rest[0];
    const skipped = args === "skip";

    // SAFETY: UseQueryArgs permits omission only when the ref has no argument keys, so {} is the corresponding decoded args value.
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
      () => useConvexQuery(functionReference, encodedArgs),
    );

    return useMemo(
      () =>
        Result.match(encodedReturnsOrError, {
          onSuccess: (encodedReturnsOrUndefined) =>
            encodedReturnsOrUndefined === undefined
              ? QueryResult.load(skipped)
              : QueryResult.succeed(
                  Ref.decodeReturnsSync(ref, encodedReturnsOrUndefined),
                ),
          onFailure: (error) => {
            if (Ref.isConvexError(error)) {
              const decoded = Ref.decodeErrorOption(ref, error.data);

              if (Option.isSome(decoded)) {
                return QueryResult.fail(decoded.value);
              }
            }

            throw error;
          },
        }),
      // `Result.try` allocates a fresh wrapper each render, so we key the memo on
      // the stable value it carries (the Convex result or thrown error) rather
      // than the wrapper itself; the decoded result is a function of that value,
      // `ref`, and `skipped`.
      [ref, skipped, Result.merge(encodedReturnsOrError)],
    );
  };

  const MINIMUM_CONVEX_VERSION = "1.36.0";

  /**
   * The non-throwing mode of `usePaginatedQueryInternal`—its fourth,
   * `throwOnError` parameter—arrived in convex 1.36.0. Convex 1.32 through 1.35
   * export the same symbol taking only three parameters, where a fourth
   * argument is silently ignored and errors are always thrown.
   *
   * The function itself cannot be interrogated for this: `Function.length`
   * counts parameters up to the first one with a default, and 1.36.0 declares
   * `throwOnError = true`, so both shapes report an arity of 3. The package
   * version is the only reliable signal.
   */
  const supportsErrorsAsValues = ((): boolean => {
    const [major, minor] = convexVersion.split(".").map(Number);

    if (
      major === undefined ||
      minor === undefined ||
      Number.isNaN(major) ||
      Number.isNaN(minor)
    ) {
      return false;
    }

    const minimumMajor = 1;
    const minimumMinor = 36;

    return (
      major > minimumMajor || (major === minimumMajor && minor >= minimumMinor)
    );
  })();

  /**
   * Load data reactively from a paginated query defined with
   * `FunctionSpec.publicPaginatedQuery`, mirroring the ergonomics of
   * `usePaginatedQuery` from `convex/react`.
   *
   * Args are encoded via the ref's user-args schema (`paginationOpts` is
   * managed by the Convex hook, not the caller), and each loaded page is
   * decoded via the ref's item schema.
   *
   * Returns a {@link PaginatedQueryResult.PaginatedQueryResult}: the loaded
   * variants carry `results` and `isLoading`, and `CanLoadMore` additionally
   * carries `loadMore`; if the `Ref` declares an `error` schema and the query
   * fails with that typed error, the decoded error is returned as the `Failure`
   * variant, which also carries the pages loaded before the failure. Unknown
   * errors are thrown, to be caught by an error boundary.
   */
  const usePaginatedQuery = <Query extends Ref.AnyPublicPaginatedQuery>(
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
    // SAFETY: Both args types omit paginationOpts; the ref encoder produces the Convex argument record, while TypeScript cannot relate the generic mapped types.
    const encodedArgs = useMemo(
      () =>
        args === "skip"
          ? ("skip" as const)
          : (Ref.encodePaginatedQueryArgsSync(
              ref,
              // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Both types omit paginationOpts from this ref; TypeScript cannot relate the conditional key-remapped type to generic Omit.
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

    // SAFETY: A Failure is constructed only after decoding a declared error schema, so it cannot occur for E = never; TypeScript cannot reduce that conditional type.
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
   * Whether a paginated query error means the stored cursors no longer match
   * the query (a data-dependent query changed underneath us), calling for a
   * full pagination reset rather than a failure.
   */
  const isInvalidCursorError = (error: Error): boolean =>
    error.message.includes("InvalidCursor") ||
    (error instanceof ConvexError &&
      Predicate.isObjectOrArray(error.data) &&
      Predicate.hasProperty(error.data, "paginationError") &&
      // Both Convex's built-in pagination (which also sets
      // `isConvexSystemError`) and `QueryStream.paginate` signal an invalid
      // cursor with this data shape—the same check `convex/react` performs.
      error.data.paginationError === "InvalidCursor");

  const NO_ITEMS: ReadonlyArray<unknown> = [];

  /**
   * EXPERIMENTAL—endCursor-pinned reactive pagination (see
   * `notes/stream-based-querying.md`). Use it with paginated queries whose
   * handlers paginate via `QueryStream.paginate`: those don't write the query
   * journal that {@link usePaginatedQuery}'s built-in reactivity relies on, so
   * gap-free pages must be maintained by the client instead. (It works with any
   * paginated query honoring the `endCursor` protocol field, including the
   * built-in `paginate`.)
   *
   * Each loaded page is pinned to a fixed index range by re-subscribing it with
   * its `continueCursor` echoed back as `endCursor`—pages then grow and shrink
   * reactively but always meet exactly, and a page that outgrows
   * `initialNumItems` is split in two. This is the mechanism of
   * `convex-helpers/react`'s `usePaginatedQuery`, re-expressed over the pure
   * {@link StreamPagination} state machine, with args/items/errors codec'd
   * through the ref's schemas exactly like {@link usePaginatedQuery}.
   */
  const useStreamPaginatedQuery = <Query extends Ref.AnyPublicPaginatedQuery>(
    ref: Query,
    args: UsePaginatedQueryArgs<Query>,
    options: {
      readonly initialNumItems: number;
      /**
       * Per-page read budgets forwarded as `paginationOpts.maximumRowsRead` and
       * `paginationOpts.maximumBytesRead`: a page that would scan more rows, or
       * read more bytes, than these returns truncated with `SplitRequired` (and
       * the hook splits it) instead of exceeding Convex's query limits on a
       * filter-heavy stream.
       */
      readonly maximumRowsRead?: number;
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
    const functionReference = useMemo(
      () => Ref.getFunctionReference(ref),
      [ref],
    );

    const skipped = args === "skip";

    // SAFETY: Both args types omit paginationOpts; the ref encoder produces the Convex argument record, while TypeScript cannot relate the generic mapped types.
    const rawEncodedArgs =
      args === "skip"
        ? undefined
        : (Ref.encodePaginatedQueryArgsSync(
            ref,
            // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Both types omit paginationOpts from this ref; TypeScript cannot relate the conditional key-remapped type to generic Omit.
            args as unknown as Omit<Ref.Args<Query>, "paginationOpts">,
          ) as Record<string, Value>);

    const encodedArgsKey =
      rawEncodedArgs === undefined
        ? "skip"
        : JSON.stringify(convexToJson(rawEncodedArgs));

    const encodedArgs = useMemo(
      () => rawEncodedArgs,
      // The serialized form stands in for the freshly allocated object.
      [ref, encodedArgsKey],
    );

    // A change of query, args, skippedness, or page size restarts pagination
    // from scratch.
    const resetKey = useMemo(
      () =>
        JSON.stringify([
          getFunctionName(functionReference),
          encodedArgsKey,
          options.initialNumItems,
          options.maximumRowsRead ?? null,
          options.maximumBytesRead ?? null,
        ]),
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
      resetKey,
      state: freshState(),
    }));

    // Render-phase reset—the React-sanctioned derived-state-from-props
    // pattern, also how `convex/react`'s own paginated hook resets.
    let current = tracked;

    if (current.resetKey !== resetKey) {
      current = { resetKey, state: freshState() };
      setTracked(current);
    }

    const applyTransitions = useCallback(
      (
        transitions: ReadonlyArray<
          (state: StreamPagination.State) => StreamPagination.State
        >,
      ) =>
        setTracked((previous) => ({
          resetKey: previous.resetKey,
          state: transitions.reduce(
            (state, transition) => transition(state),
            previous.state,
          ),
        })),
      [],
    );

    const queries = useMemo(
      () =>
        StreamPagination.pageRequests(current.state, (page) => ({
          query: functionReference,
          args: { ...encodedArgs, paginationOpts: page },
        })),
      [current.state, functionReference, encodedArgs],
    );

    const resultsObject = useConvexQueries(queries);

    const interpretation = useMemo(
      () =>
        StreamPagination.interpret(current.state, resultsObject, {
          initialNumItems: options.initialNumItems,
          isInvalidCursorError,
        }),
      [current.state, resultsObject, options.initialNumItems],
    );

    // Apply the transitions this render discovered (completed split swaps,
    // new splits of overgrown pages) or restart after an invalid cursor—render-phase state updates, as in `convex-helpers`' hook. Both settle:
    // the updated state no longer produces the same discovery.
    if (Predicate.isTagged(interpretation, "ResetRequired")) {
      setTracked((previous) => ({
        resetKey: previous.resetKey,
        state: freshState(),
      }));
    } else if (
      Predicate.isTagged(interpretation, "Interpreted") &&
      interpretation.transitions.length > 0
    ) {
      applyTransitions(interpretation.transitions);
    }

    const encodedItems = Match.value(interpretation).pipe(
      Match.tag("ResetRequired", () => NO_ITEMS),
      Match.orElse((value) => value.items),
    );

    // Page results keep their identity while unchanged (only the page that
    // actually updated is a fresh object), so caching decodes per encoded
    // item makes a single-page update decode only that page's items rather
    // than every loaded page's.
    const decodeCache = useMemo(
      () => new WeakMap<object, PaginatedQueryItem<Query>>(),
      [ref],
    );

    const decodedResults = useMemo(
      () =>
        encodedItems.map((item): PaginatedQueryItem<Query> => {
          if (!Predicate.isObjectOrArray(item)) {
            return Ref.decodePaginationPageSync(ref, [item])[0];
          }

          const cached = decodeCache.get(item);

          if (cached !== undefined) {
            return cached;
          }

          const decoded = Ref.decodePaginationPageSync(ref, [item])[0];

          decodeCache.set(item, decoded);

          return decoded;
        }),
      [ref, encodedItems, decodeCache],
    );

    // SAFETY: A Failure is constructed only after decoding a declared error schema, so it cannot occur for E = never; TypeScript cannot reduce that conditional type.
    return useMemo(
      (): PaginatedQueryResult.Variants<
        PaginatedQueryItem<Query>,
        Ref.Error<Query>
      > =>
        Match.value(interpretation).pipe(
          Match.tag("ResetRequired", () =>
            PaginatedQueryResult.loadingFirstPage({ skipped }),
          ),
          Match.tag("Failed", ({ error }) => {
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
          }),
          Match.tag("Interpreted", ({ lastResult }) => {
            if (
              Option.isNone(lastResult) &&
              current.state.pageKeys.length <= 1
            ) {
              return PaginatedQueryResult.loadingFirstPage({ skipped });
            }

            if (
              Option.isNone(lastResult) ||
              StreamPagination.isLastPageSplitting(current.state)
            ) {
              return PaginatedQueryResult.loadingMore({
                results: decodedResults,
              });
            }

            if (lastResult.value.isDone) {
              return PaginatedQueryResult.exhausted({
                results: decodedResults,
              });
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
                    StreamPagination.loadMore(
                      continueCursor,
                      numItems,
                      options,
                    ),
                  ]);
                }
              },
            });
          }),
          Match.exhaustive,
        ),
      [
        interpretation,
        decodedResults,
        current.state,
        skipped,
        ref,
        applyTransitions,
      ],
    ) as PaginatedQueryResult.PaginatedQueryResult<
      PaginatedQueryItem<Query>,
      Ref.Error<Query>
    >;
  };

  const makeReactMutation = <Mutation extends Ref.AnyPublicMutation>(
    ref: Mutation,
    convexReactMutation: ConvexReactMutation<FunctionReference<"mutation">>,
  ): ReactMutation<Mutation> => {
    // SAFETY: hasErrorSchema selects Result exactly when InvokeReturn includes an error type; without an error schema, getOrThrow returns the decoded value.
    const callable = ((...args: Ref.OptionalArgs<Mutation>) =>
      invokeAsResult(
        ref,
        (_, encodedArgs) => convexReactMutation(encodedArgs),
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
   * Returns a {@link ReactMutation} handle for the provided `Ref`'s mutation.
   * The handle is callable to invoke the mutation, and exposes
   * `withOptimisticUpdate` for attaching an optimistic update, mirroring
   * `useMutation` from `convex/react`.
   *
   * If the `Ref` declares an `error` schema, the returned promise resolves to a
   * `Result` with the decoded `returns` value in the `Success` and the decoded
   * error in the `Failure`.
   *
   * If the `Ref` does not declare an `error` schema, the promise resolves
   * directly to the decoded `returns` value, matching the behavior of
   * `useMutation` from `convex/react`.
   *
   * Any other failure rejects the promise.
   */
  const useMutation = <Mutation extends Ref.AnyPublicMutation>(
    ref: Mutation,
  ): ReactMutation<Mutation> => {
    const functionReference = Ref.getFunctionReference(ref);
    const convexReactMutation = useConvexMutation(functionReference);

    return useMemo(
      () => makeReactMutation(ref, convexReactMutation),
      [ref, convexReactMutation],
    );
  };

  /**
   * Returns a function that invokes the provided `Ref`'s action.
   *
   * If the `Ref` declares an `error` schema, the returned promise resolves to a
   * `Result` with the decoded `returns` value in the `Success` and the decoded
   * error in the `Failure`.
   *
   * If the `Ref` does not declare an `error` schema, the promise resolves
   * directly to the decoded `returns` value, matching the behavior of
   * `useMutation` from `convex/react`.
   *
   * Any other failure rejects the promise.
   */
  const useAction = <Action extends Ref.AnyPublicAction>(
    ref: Action,
  ): ((...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>) => {
    const functionReference = Ref.getFunctionReference(ref);
    const actualAction = useConvexAction(functionReference);

    // SAFETY: hasErrorSchema selects Result exactly when InvokeReturn includes an error type; without an error schema, getOrThrow returns the decoded value.
    return useCallback(
      ((...args: Ref.OptionalArgs<Action>) =>
        invokeAsResult(
          ref,
          (_, encodedArgs) => actualAction(encodedArgs),
          args,
        ).then((result) =>
          Ref.hasErrorSchema(ref) ? result : Result.getOrThrow(result),
        )) as (...args: Ref.OptionalArgs<Action>) => InvokeReturn<Action>,
      [ref, actualAction],
    );
  };

  const invokeAsResult = <Ref_ extends Ref.Any>(
    ref: Ref_,
    invoke: (
      fnRef: Ref.FunctionReference<Ref_>,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Ref.runWithCodec encodes args before invoking this raw Convex callback.
      encodedArgs: unknown,
      // oxlint-disable-next-line anti-slop/no-unknown-returns -- Ref.runWithCodec decodes the raw result after this Convex callback resolves.
    ) => PromiseLike<unknown>,
    args: Ref.OptionalArgs<Ref_>,
  ): Promise<Result.Result<Ref.Returns<Ref_>, Ref.Error<Ref_>>> => {
    // SAFETY: OptionalArgs permits omission only for an empty args schema, so the fallback satisfies that ref's decoded args type.
    const exitPromise = Effect.runPromiseExit(
      Ref.runWithCodec(ref, (args[0] ?? {}) as Ref.Args<Ref_>, invoke).pipe(
        Effect.catchTag("SchemaError", Effect.die),
        Effect.result,
      ),
    );

    return exitPromise.then((exit) => {
      if (Exit.isSuccess(exit)) return exit.value;
      throw Cause.squash(exit.cause);
    });
  };

  return {
    useQuery,
    usePaginatedQuery,
    useStreamPaginatedQuery,
    useMutation,
    useAction,
  };
};
