import { convexHooks } from "./internal/convex";
import { createHooks } from "./internal/hooks";

export * as OptimisticLocalStore from "./OptimisticLocalStore";

export * as PaginatedQueryResult from "./PaginatedQueryResult";

export * as QueryResult from "./QueryResult";

export * as StreamPagination from "./StreamPagination";

export type {
  InvokeReturn,
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryOptions,
  UsePaginatedQueryArgs,
  OptimisticUpdate,
  ReactMutation,
} from "./internal/hooks";

const hooks = createHooks(convexHooks);

export const useQuery = hooks.useQuery;

/**
 * Load data reactively from a paginated query defined with
 * `FunctionSpec.publicPaginatedQuery`, mirroring the ergonomics of
 * `usePaginatedQuery` from `convex/react`.
 *
 * Args are encoded via the ref's user-args schema (`paginationOpts` is managed
 * by the Convex hook, not the caller), and each loaded page is decoded via the
 * ref's item schema.
 *
 * Returns a {@link PaginatedQueryResult.PaginatedQueryResult}: the loaded
 * variants carry `results` and `isLoading`, and `CanLoadMore` additionally
 * carries `loadMore`; if the `Ref` declares an `error` schema and the query
 * fails with that typed error, the decoded error is returned as the `Failure`
 * variant, which also carries the pages loaded before the failure. Unknown
 * errors are thrown, to be caught by an error boundary.
 */
export const usePaginatedQuery = hooks.usePaginatedQuery;

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
 * {@link StreamPagination} state machine, with args/items/errors codec'd through
 * the ref's schemas exactly like {@link usePaginatedQuery}.
 */
export const useStreamPaginatedQuery = hooks.useStreamPaginatedQuery;

/**
 * Returns a {@link ReactMutation} handle for the provided `Ref`'s mutation. The
 * handle is callable to invoke the mutation, and exposes `withOptimisticUpdate`
 * for attaching an optimistic update, mirroring `useMutation` from
 * `convex/react`.
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
export const useMutation = hooks.useMutation;

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
export const useAction = hooks.useAction;
