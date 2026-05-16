import { FunctionImpl, GroupImpl } from "@confect/server";
import { Clock, Effect, Layer } from "effect";
import api from "../_generated/api";

// `confectNoTime` is the analog of the original PR #383 reproduction: a
// Confect handler that does not observe time anywhere in user code, so any
// `Date.now()` call coming out of the Effect runtime (e.g.
// `FiberId.unsafeMake`) reaching `op_now` would be a regression of the v6
// stub. The handler returns `Math.random()` purely so the test can
// distinguish "cache hit replayed the same execution" from "cache evicted
// and the handler re-ran with the same constant output" — there is no
// cache-hit/miss flag on Convex's `/api/query` response, only the return
// value. `Math.random()` flips `observed_rng_during_execution` but that
// flag is **not** checked by `MAX_CACHE_AGE` eviction
// (`crates/application/src/cache/mod.rs:700`), so it does not perturb the
// behavior the test is asserting.
const confectNoTime = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectNoTime",
  () => Effect.sync(() => Math.random()),
);

const confectWithClock = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectWithClock",
  () => Clock.currentTimeMillis,
);

const confectWithRawDateNow = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectWithRawDateNow",
  () => Effect.sync(() => Date.now()),
);

// `confectWithSpan` exercises the bug PR #399 fixes: when user code does not
// touch the `Clock` service at all, but Effect's runtime *internally* invokes
// `clock.unsafeCurrentTimeNanos()` (e.g. when creating / ending a tracing
// span -- `internal/core-effect.js:777,810`), the v6 `unpatchedClock` wiring
// (`unsafeCurrentTimeMillis = () => realDateNow()`) reaches `op_now` and
// busts the cache. The handler returns `Math.random()` for the same reason
// `confectNoTime` does -- a per-execution witness that doesn't itself
// observe time.
const confectWithSpan = FunctionImpl.make(
  api,
  "groups.cacheStubbing",
  "confectWithSpan",
  () =>
    Effect.sync(() => Math.random()).pipe(
      Effect.withSpan("cacheStubbing.confectWithSpan"),
    ),
);

export const cacheStubbing = GroupImpl.make(api, "groups.cacheStubbing").pipe(
  Layer.provide(confectNoTime),
  Layer.provide(confectWithClock),
  Layer.provide(confectWithRawDateNow),
  Layer.provide(confectWithSpan),
);
