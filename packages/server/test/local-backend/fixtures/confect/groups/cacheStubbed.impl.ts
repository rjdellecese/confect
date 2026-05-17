/**
 * Handlers return `Math.random()` as a per-execution witness: the test
 * compares two consecutive query results to detect whether the cache evicted
 * (different values) or held (same value). `Math.random` flips
 * `observed_rng_during_execution` but that flag is not checked by
 * `MAX_CACHE_AGE` eviction, so it does not perturb the behavior under test.
 */

import { FunctionImpl, GroupImpl } from "@confect/server";
import { Clock, Effect, Layer } from "effect";
import api from "../_generated/api";

const confectNoTime = FunctionImpl.make(
  api,
  "groups.cacheStubbed",
  "confectNoTime",
  () => Effect.sync(() => Math.random()),
);

const confectWithClock = FunctionImpl.make(
  api,
  "groups.cacheStubbed",
  "confectWithClock",
  () => Clock.currentTimeMillis,
);

const confectWithRawDateNow = FunctionImpl.make(
  api,
  "groups.cacheStubbed",
  "confectWithRawDateNow",
  () => Effect.sync(() => Date.now()),
);

/**
 * Exercises the bug fixed in PR #399: Effect's runtime internally calls
 * `clock.unsafeCurrentTimeNanos()` when creating/ending a span, which used
 * to reach `op_now` via `unpatchedClock` and bust the cache even though user
 * code never touched `Clock`.
 */
const confectWithSpan = FunctionImpl.make(
  api,
  "groups.cacheStubbed",
  "confectWithSpan",
  () =>
    Effect.sync(() => Math.random()).pipe(
      Effect.withSpan("cacheStubbed.confectWithSpan"),
    ),
);

export const cacheStubbed = GroupImpl.make(api, "groups.cacheStubbed").pipe(
  Layer.provide(confectNoTime),
  Layer.provide(confectWithClock),
  Layer.provide(confectWithRawDateNow),
  Layer.provide(confectWithSpan),
);
