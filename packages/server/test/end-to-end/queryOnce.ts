import { ConvexHttpClient } from "convex/browser";
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
 * eviction behave identically. Each invocation here is a fresh HTTP
 * request — there is no per-call resource to acquire/release.
 *
 * Accepts a `FunctionReference` rather than a raw name so the return
 * type is inferred at the call site (via `FunctionReturnType<Q>`). Get
 * one from a Confect `Ref` via `Ref.getFunctionReference`, or from a
 * raw module path via `convex/server`'s `makeFunctionReference`.
 */
export const queryOnce = <Q extends FunctionReference<"query">>(
  url: string,
  reference: Q,
  ...args: OptionalRestArgs<Q>
): Effect.Effect<FunctionReturnType<Q>, ConvexQueryError> =>
  Effect.tryPromise({
    try: () => new ConvexHttpClient(url).query(reference, ...args),
    catch: (error) => new ConvexQueryError(`query failed: ${String(error)}`),
  });
