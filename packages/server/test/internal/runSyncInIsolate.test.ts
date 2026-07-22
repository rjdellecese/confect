import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { describe, expect, test } from "vitest";
import {
  runSyncExitInIsolate,
  runSyncInIsolate,
  runSyncThrowInIsolate,
} from "../../src/internal/runSyncInIsolate";

/**
 * A purely synchronous program that burns several multiples of
 * `MaxOpsBeforeYield` (2048), like a large app's registration layer build or
 * schema → validator compile. `Effect.sync` (unlike `Effect.succeed`, which
 * the generator runtime unwraps without touching the op counter) charges the
 * fiber's op budget on every iteration.
 */
const sumToN = (n: number) =>
  Effect.gen(function* () {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      sum += yield* Effect.sync(() => i);
    }
    return sum;
  });

const expectedSum = (5000 * 5001) / 2;

/**
 * Simulate the Convex query/mutation isolate for the duration of `run`:
 * `setTimeout` throws Convex's error, and `setImmediate` (absent in the
 * isolate, so Effect's default scheduler would fall back to `setTimeout`)
 * throws too, so any timer use surfaces as a test failure. Only synchronous
 * code runs inside the stub window.
 */
const withConvexIsolateTimers = <A>(run: () => A): A => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalSetImmediate = globalThis.setImmediate;
  const ban = (name: string) => () => {
    throw new Error(
      `Can't use ${name} in queries and mutations. Please consider using an action.`,
    );
  };
  globalThis.setTimeout = ban("setTimeout") as never;
  globalThis.setImmediate = ban("setImmediate") as never;
  try {
    return run();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.setImmediate = originalSetImmediate;
  }
};

describe("runSyncInIsolate", () => {
  // Documents why these runners exist: `Effect.runSync` forks with its own
  // `MixedScheduler("sync")` whose dispatcher eagerly arms
  // `setImmediate`/`setTimeout` when the fiber's op budget forces a yield. If
  // this test ever fails, Effect has made `runSync` timer-free and the
  // isolate-safe runners can be retired.
  test("Effect.runSync uses banned timer APIs past the fiber op budget", () => {
    expect(() =>
      withConvexIsolateTimers(() => Effect.runSync(sumToN(5000))),
    ).toThrow(/Can't use set(Timeout|Immediate)/);
  });

  test("runSyncInIsolate runs past the fiber op budget without timers", () => {
    const result = withConvexIsolateTimers(() =>
      runSyncInIsolate(sumToN(5000)),
    );
    expect(result).toBe(expectedSum);
  });

  test("runSyncExitInIsolate runs past the fiber op budget without timers", () => {
    const exit = withConvexIsolateTimers(() =>
      runSyncExitInIsolate(sumToN(5000)),
    );
    expect(exit._tag).toBe("Success");
  });

  test("runSyncThrowInIsolate runs past the fiber op budget without timers", () => {
    const result = withConvexIsolateTimers(() =>
      runSyncThrowInIsolate(sumToN(5000)),
    );
    expect(result).toBe(expectedSum);
  });

  test("runSyncThrowInIsolate throws the squashed failure", () => {
    class BoomError extends Data.TaggedError("BoomError")<{
      message: string;
    }> {}

    expect(() =>
      runSyncThrowInIsolate(Effect.fail(new BoomError({ message: "boom" }))),
    ).toThrow("boom");
  });
});
