import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
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
 */
export const queryOnce = <A>(
  url: string,
  functionName: string,
): Effect.Effect<A, ConvexQueryError> =>
  Effect.tryPromise({
    try: async () => {
      const client = new ConvexHttpClient(url);
      const reference = makeFunctionReference<"query">(functionName);
      return (await client.query(reference)) as A;
    },
    catch: (error) =>
      new ConvexQueryError(`query ${functionName} failed: ${String(error)}`),
  });
