/**
 * End-to-end regression test for the cache-stubbing fix in
 * `RegisteredConvexFunction.queryFunction` (`withStubbedDateNow`). Asserts
 * at the cache layer that Confect-wrapped queries don't trip
 * `observed_time` and so stay cached across `MAX_CACHE_AGE`, while the
 * `Clock.currentTimeMillis` opt-in still evicts.
 */

import { Ref } from "@confect/core";
import { describe, expect, layer } from "@effect/vitest";
import type { ConvexHttpClient } from "convex/browser";
import { Duration, Effect, Schema } from "effect";
import refs from "./fixtures/confect/_generated/refs";
import * as LocalBackend from "./LocalBackend";

class ConvexQueryError extends Schema.TaggedError<ConvexQueryError>()(
  "ConvexQueryError",
  { message: Schema.String },
) {}

/**
 * Run a Confect query once over HTTP. Accepts a Confect `Ref` so the return
 * type is inferred at the call site via `Ref.Returns<R>`.
 */
const queryOnce = <R extends Ref.AnyPublicQuery>(
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

// `MAX_CACHE_AGE` plus 1s of slack for scheduling jitter.
const SLEEP_PAST_CACHE = Duration.sum(LocalBackend.maxCacheAge, "1 second");

const captureAcrossEvictionWindow = <PublicQueryRef extends Ref.AnyPublicQuery>(
  ref: PublicQueryRef,
  ...args: Ref.OptionalArgs<PublicQueryRef>
) =>
  Effect.gen(function* () {
    const { client } = yield* LocalBackend.LocalBackend;
    const initial = yield* queryOnce(client, ref, ...args);
    yield* Effect.sleep(SLEEP_PAST_CACHE);
    const afterMaxCacheAge = yield* queryOnce(client, ref, ...args);
    return { initial, afterMaxCacheAge };
  });

describe("Cache regression (e2e)", () => {
  // `excludeTestServices: true` opts out of `TestClock` so `Effect.sleep`
  // waits real wall-clock time and actually crosses the eviction window.
  layer(LocalBackend.layer, {
    timeout: "120 seconds",
    excludeTestServices: true,
  })((it) => {
    it.effect(
      "control: native query that calls Date.now evicts after MAX_CACHE_AGE",
      () =>
        Effect.gen(function* () {
          const { initial, afterMaxCacheAge } =
            yield* captureAcrossEvictionWindow(
              refs.public.groups.cacheControl.control,
            );
          expect(initial, "harness sanity: control should re-execute").not.toBe(
            afterMaxCacheAge,
          );
        }),
      30_000,
    );

    it.effect(
      "regression: Confect query stays cached across MAX_CACHE_AGE",
      () =>
        Effect.gen(function* () {
          const { initial, afterMaxCacheAge } =
            yield* captureAcrossEvictionWindow(
              refs.public.groups.cacheStubbing.confectNoTime,
            );
          expect(
            initial,
            "withStubbedDateNow should keep observed_time=false so the cache holds",
          ).toBe(afterMaxCacheAge);
        }),
    );

    it.effect(
      "regression: Confect query that calls raw Date.now stays cached",
      () =>
        Effect.gen(function* () {
          const { initial, afterMaxCacheAge } =
            yield* captureAcrossEvictionWindow(
              refs.public.groups.cacheStubbing.confectWithRawDateNow,
            );
          expect(
            initial,
            "withStubbedDateNow should mask user-level Date.now too",
          ).toBe(afterMaxCacheAge);
        }),
    );

    it.effect(
      "opt-in: Clock.currentTimeMillis correctly evicts after MAX_CACHE_AGE",
      () =>
        Effect.gen(function* () {
          const { initial, afterMaxCacheAge } =
            yield* captureAcrossEvictionWindow(
              refs.public.groups.cacheStubbing.confectWithClock,
            );
          expect(
            initial,
            "Clock.currentTimeMillis should reach op_now via the unpatched clock",
          ).not.toBe(afterMaxCacheAge);
        }),
    );

    it.effect(
      "regression (PR #399): Effect.withSpan must not bust the cache",
      () =>
        Effect.gen(function* () {
          const { initial, afterMaxCacheAge } =
            yield* captureAcrossEvictionWindow(
              refs.public.groups.cacheStubbing.confectWithSpan,
            );
          expect(
            initial,
            "Effect.withSpan calls clock.unsafeCurrentTimeNanos internally; " +
              "that path must not reach op_now (PR #399)",
          ).toBe(afterMaxCacheAge);
        }),
    );
  });
});
