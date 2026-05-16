import type { ConvexHttpClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { Effect } from "effect";

class ConvexQueryError extends Error {
  readonly _tag = "ConvexQueryError";
}

/**
 * Run a Convex query once over HTTP, with no reactive subscription.
 *
 * `ConvexHttpClient.query` POSTs to `/api/query`, which the local backend
 * routes through the same `CacheManager.get` (in
 * `crates/application/src/application_function_runner/mod.rs::run_query_at_ts_inner`)
 * that the WebSocket sync worker uses, so cache hits and `MAX_CACHE_AGE`
 * eviction behave identically.
 *
 * The client is supplied by the caller (in this suite, by the
 * `LocalBackend` service) so a single `ConvexHttpClient` instance is shared
 * across every test case — there is no per-call construction cost and no
 * risk of multiple clients drifting out of sync.
 *
 * Accepts a `FunctionReference` rather than a raw name so the return
 * type is inferred at the call site (via `FunctionReturnType<Q>`). Get
 * one from a Confect `Ref` via `Ref.getFunctionReference`.
 */
export const queryOnce = <Q extends FunctionReference<"query">>(
  client: ConvexHttpClient,
  reference: Q,
  ...args: OptionalRestArgs<Q>
): Effect.Effect<FunctionReturnType<Q>, ConvexQueryError> =>
  Effect.tryPromise({
    try: () => client.query(reference, ...args),
    catch: (error) => new ConvexQueryError(`query failed: ${String(error)}`),
  });
