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

import { ConvexClient } from "convex/browser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnLocalBackend } from "./spawnLocalBackend";
import { subscribeOnce } from "./subscribeOnce";

const MAX_CACHE_AGE_MS = 3_000;
const SLEEP_PAST_CACHE_MS = MAX_CACHE_AGE_MS + 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const captureWithFreshClient = async (
  url: string,
  functionName: string,
): Promise<number> => {
  const client = new ConvexClient(url);
  try {
    return await subscribeOnce<number>(client, functionName);
  } finally {
    await client.close();
  }
};

const captureAcrossEvictionWindow = async (
  url: string,
  functionName: string,
): Promise<{ first: number; second: number }> => {
  const first = await captureWithFreshClient(url, functionName);
  await sleep(SLEEP_PAST_CACHE_MS);
  const second = await captureWithFreshClient(url, functionName);
  return { first, second };
};

describe.runIf(process.platform !== "win32")("Cache regression (e2e)", () => {
  let url: string;
  let stopBackend: () => Promise<void>;

  beforeAll(async () => {
    const backend = await spawnLocalBackend();
    url = backend.url;
    stopBackend = backend.stop;
  }, 120_000);

  afterAll(async () => {
    if (stopBackend !== undefined) {
      await stopBackend();
    }
  }, 30_000);

  it("control: native query that calls Date.now evicts after MAX_CACHE_AGE", async () => {
    const { first, second } = await captureAcrossEvictionWindow(
      url,
      "groups/cacheControl:control",
    );
    // Sanity check on the harness itself: if this fails, the test
    // infrastructure is broken (cache eviction is not happening within the
    // configured window) and any green Confect cases below are meaningless.
    expect(first, "harness sanity: control should re-execute").not.toBe(second);
  }, 20_000);

  it("regression: Confect query stays cached across MAX_CACHE_AGE", async () => {
    const { first, second } = await captureAcrossEvictionWindow(
      url,
      "groups/cacheStubbing:confectNoTime",
    );
    expect(
      first,
      "withStubbedDateNow should keep observed_time=false so the cache holds",
    ).toBe(second);
  }, 20_000);

  it("regression: Confect query that calls raw Date.now stays cached", async () => {
    const { first, second } = await captureAcrossEvictionWindow(
      url,
      "groups/cacheStubbing:confectWithRawDateNow",
    );
    expect(
      first,
      "withStubbedDateNow should mask user-level Date.now too",
    ).toBe(second);
  }, 20_000);

  it("opt-in: Clock.currentTimeMillis correctly evicts after MAX_CACHE_AGE", async () => {
    const { first, second } = await captureAcrossEvictionWindow(
      url,
      "groups/cacheStubbing:confectWithClock",
    );
    expect(
      first,
      "Clock.currentTimeMillis should reach op_now via the unpatched clock",
    ).not.toBe(second);
  }, 20_000);
});
