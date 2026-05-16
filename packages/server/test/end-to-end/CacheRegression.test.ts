/**
 * End-to-end regression test for the v6 cache-stubbing fix in
 * `RegisteredConvexFunction.queryFunction` (`withStubbedDateNow`).
 *
 * What this asserts at the cache layer (not at the stub level):
 *
 *   - A native Convex query that calls `Date.now()` flips
 *     `observed_time = true` in the UDF outcome and is therefore evicted
 *     from the reactive cache after `MAX_CACHE_AGE`. This is the **positive
 *     control**: if it does not evict, the harness (timeout knobs, polling
 *     cadence, backend lifecycle) is broken and no green Confect case below
 *     is meaningful.
 *
 *   - A Confect-wrapped query that does not observe time stays cached past
 *     `MAX_CACHE_AGE`. This is the regression test for the v6 fix.
 *
 *   - A Confect-wrapped query whose user code calls raw `Date.now()` ALSO
 *     stays cached, because `withStubbedDateNow` patches the global before
 *     the handler runs. Documents that the stub covers user code, not just
 *     Effect's internal `FiberId.unsafeMake`.
 *
 *   - A Confect-wrapped query that opts into the real wall clock via
 *     `Clock.currentTimeMillis` correctly evicts (the `unpatchedClock`
 *     provided by `Effect.withClock` reaches `op_now`). Guards against an
 *     accidental future regression that would silently break the opt-in by
 *     extending the stub to the Clock service.
 *
 * `MAX_CACHE_AGE = DATABASE_UDF_USER_TIMEOUT_SECONDS +
 *  DATABASE_UDF_SYSTEM_TIMEOUT_SECONDS + 1s`. The fixture sets both
 * timeouts to 1, giving a 3s eviction window; the test waits 4s between
 * captures.
 */

import { Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import refs from "../confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";
import { queryOnce } from "./queryOnce";

const SLEEP_PAST_CACHE = "4 seconds";

// All four fixtures are zero-arg, so `{}` is always a valid args object.
// We pass it explicitly because TypeScript does not simplify
// `OptionalRestArgs<...>` at this generic call site to drop the args tuple.
const captureAcrossEvictionWindow = <R extends Ref.AnyPublicQuery>(ref: R) =>
  Effect.gen(function* () {
    const { url } = yield* LocalBackend.LocalBackend;
    const reference = Ref.getFunctionReference(ref);
    const first = yield* queryOnce(url, reference, {});
    yield* Effect.sleep(SLEEP_PAST_CACHE);
    const second = yield* queryOnce(url, reference, {});
    return { first, second };
  });

describe("Cache regression (e2e)", () => {
  // `excludeTestServices: true` opts out of `TestClock`/`TestServices` so
  // that `Effect.sleep` actually waits real wall-clock time — without this
  // the test-runtime clock is virtual and `Effect.sleep("4 seconds")` would
  // never fire, so the cache eviction window is never crossed.
  layer(LocalBackend.layer, {
    timeout: "120 seconds",
    excludeTestServices: true,
  })((it) => {
    it.effect(
      "control: native query that calls Date.now evicts after MAX_CACHE_AGE",
      () =>
        Effect.gen(function* () {
          const { first, second } = yield* captureAcrossEvictionWindow(
            refs.public.groups.cacheControl.control,
          );
          // Sanity check on the harness itself: if this fails, the test
          // infrastructure is broken (cache eviction is not happening within
          // the configured window) and any green Confect cases below are
          // meaningless.
          expect(first, "harness sanity: control should re-execute").not.toBe(
            second,
          );
        }),
      30_000,
    );

    it.effect(
      "regression: Confect query stays cached across MAX_CACHE_AGE",
      () =>
        Effect.gen(function* () {
          const { first, second } = yield* captureAcrossEvictionWindow(
            refs.public.groups.cacheStubbing.confectNoTime,
          );
          expect(
            first,
            "withStubbedDateNow should keep observed_time=false so the cache holds",
          ).toBe(second);
        }),
    );

    it.effect(
      "regression: Confect query that calls raw Date.now stays cached",
      () =>
        Effect.gen(function* () {
          const { first, second } = yield* captureAcrossEvictionWindow(
            refs.public.groups.cacheStubbing.confectWithRawDateNow,
          );
          expect(
            first,
            "withStubbedDateNow should mask user-level Date.now too",
          ).toBe(second);
        }),
    );

    it.effect(
      "opt-in: Clock.currentTimeMillis correctly evicts after MAX_CACHE_AGE",
      () =>
        Effect.gen(function* () {
          const { first, second } = yield* captureAcrossEvictionWindow(
            refs.public.groups.cacheStubbing.confectWithClock,
          );
          expect(
            first,
            "Clock.currentTimeMillis should reach op_now via the unpatched clock",
          ).not.toBe(second);
        }),
    );
  });
});
