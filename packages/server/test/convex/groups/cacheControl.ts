import { query } from "../_generated/server";

/**
 * Positive control for the cache regression test.
 *
 * This is a vanilla Convex query (no Confect wrapper, no `withStubbedDateNow`).
 * The handler reads `Date.now()`, which routes through V8's `op_now` op and
 * flips `observed_time = true` on the UDF outcome. Convex's query cache will
 * therefore evict this entry after `MAX_CACHE_AGE` (≈ 1 + system_timeout +
 * user_timeout seconds, with the timeouts overridden in the test fixture).
 *
 * The test asserts that re-subscribing past `MAX_CACHE_AGE` produces a
 * different `Math.random()` value here. If it doesn't, the harness (timeout
 * env vars, polling cadence, backend lifecycle) is broken — not the system
 * under test.
 */
export const control = query({
  args: {},
  handler: async () => {
    Date.now();
    return Math.random();
  },
});
