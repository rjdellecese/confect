/**
 * End-to-end regression test for the cache-stubbing fix in
 * `RegisteredConvexFunction.queryFunction` (`withStubbedDateNow`). Asserts
 * at the cache layer that Confect-wrapped queries don't trip
 * `observed_time` and so stay cached across `MAX_CACHE_AGE`, while the
 * `Clock.currentTimeMillis` opt-in still evicts.
 */

import { Ref } from "@confect/core";
import { expect, layer } from "@effect/vitest";
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

// `excludeTestServices: true` opts out of `TestClock` so `Effect.sleep`
// waits real wall-clock time and actually crosses the eviction window.
layer(LocalBackend.layer, {
  timeout: "120 seconds",
  excludeTestServices: true,
})("Convex query cache behavior", (it) => {
  it.effect(
    "a native Convex query that calls Date.now is evicted from the cache",
    () =>
      Effect.gen(function* () {
        const { initial, afterMaxCacheAge } =
          yield* captureAcrossEvictionWindow(
            refs.public.groups.cacheControl.control,
          );
        expect(initial).not.toBe(afterMaxCacheAge);
      }),
    30_000,
  );

  it.effect("a Confect query that does not observe time stays cached", () =>
    Effect.gen(function* () {
      const { initial, afterMaxCacheAge } = yield* captureAcrossEvictionWindow(
        refs.public.groups.cacheStubbed.confectNoTime,
      );
      expect(initial).toBe(afterMaxCacheAge);
    }),
  );

  it.effect("a Confect query that calls raw Date.now stays cached", () =>
    Effect.gen(function* () {
      const { initial, afterMaxCacheAge } = yield* captureAcrossEvictionWindow(
        refs.public.groups.cacheStubbed.confectWithRawDateNow,
      );
      expect(initial).toBe(afterMaxCacheAge);
    }),
  );

  it.effect(
    "a Confect query that uses Clock.currentTimeMillis is evicted from the cache",
    () =>
      Effect.gen(function* () {
        const { initial, afterMaxCacheAge } =
          yield* captureAcrossEvictionWindow(
            refs.public.groups.cacheStubbed.confectWithClock,
          );
        expect(initial).not.toBe(afterMaxCacheAge);
      }),
  );

  it.effect("a Confect query that uses Effect.withSpan stays cached", () =>
    Effect.gen(function* () {
      const { initial, afterMaxCacheAge } = yield* captureAcrossEvictionWindow(
        refs.public.groups.cacheStubbed.confectWithSpan,
      );
      expect(initial).toBe(afterMaxCacheAge);
    }),
  );

  it.effect("a Confect query that emits a log stays cached", () =>
    Effect.gen(function* () {
      const { initial, afterMaxCacheAge } = yield* captureAcrossEvictionWindow(
        refs.public.groups.cacheStubbed.confectWithLog,
      );
      expect(initial).toBe(afterMaxCacheAge);
    }),
  );
});
