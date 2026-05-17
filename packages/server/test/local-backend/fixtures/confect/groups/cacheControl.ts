import { query } from "../../convex/_generated/server";

/**
 * Positive control for the cache regression test.
 *
 * This is a vanilla Convex query (no Confect wrapper, no `withStubbedDateNow`),
 * registered through Confect's plain-Convex-function path so it sits under
 * `refs.public.groups.cacheControl.control` like every other test fixture.
 *
 * The handler returns `Date.now()`, which routes through V8's `op_now` op
 * and flips `observed_time = true` on the UDF outcome. Convex's query cache
 * therefore evicts this entry after `MAX_CACHE_AGE` (= `USER_TIMEOUT` +
 * `SYSTEM_TIMEOUT` + 1s, with the timeouts overridden in the test fixture);
 * the returned timestamp also naturally changes between executions, so the
 * test detects re-execution by comparing the two captured values.
 *
 * If they don't differ, the harness (timeout env vars, polling cadence,
 * backend lifecycle) is broken — not the system under test.
 */
export const control = query({
  args: {},
  handler: async () => Date.now(),
});
