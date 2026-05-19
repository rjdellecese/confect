import { query } from "../../convex/_generated/server";

/**
 * Positive control: a vanilla Convex query that calls `Date.now()` and so
 * observes time. The local backend evicts it from the reactive cache after
 * `MAX_CACHE_AGE`, and the returned timestamp changes between executions,
 * letting the test detect re-execution.
 */
export const control = query({
  args: {},
  handler: async () => Date.now(),
});
