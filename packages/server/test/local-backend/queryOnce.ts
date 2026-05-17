import { Ref } from "@confect/core";
import type { ConvexHttpClient } from "convex/browser";
import { Effect, Schema } from "effect";

class ConvexQueryError extends Schema.TaggedError<ConvexQueryError>()(
  "ConvexQueryError",
  { message: Schema.String },
) {}

/**
 * Run a Confect query once over HTTP.
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
 * Accepts a Confect `Ref` directly (rather than a raw `FunctionReference`
 * or string) so the return type is inferred at the call site via
 * `Ref.Returns<R>`. The underlying `FunctionReference` is built internally
 * via `Ref.getFunctionReference`.
 */
export const queryOnce = <R extends Ref.AnyPublicQuery>(
  client: ConvexHttpClient,
  ref: R,
  ...args: Ref.OptionalArgs<R>
): Effect.Effect<Ref.Returns<R>, ConvexQueryError> =>
  Effect.tryPromise({
    try: () =>
      client.query(Ref.getFunctionReference(ref), (args[0] ?? {}) as never),
    catch: (error) =>
      new ConvexQueryError({ message: `query failed: ${String(error)}` }),
  });
