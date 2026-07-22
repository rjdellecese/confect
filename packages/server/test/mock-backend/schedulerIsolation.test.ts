/// <reference types="vite/client" />

/**
 * Regression test for Effect's cooperative fiber yielding inside Convex's
 * query/mutation isolate, which bans `setTimeout` and has no `setImmediate`.
 * The fixture handlers run well past `MaxOpsBeforeYield` (2048) fiber
 * operations, forcing scheduler yields mid-handler; they only succeed if
 * every yield dispatches through the microtask queue rather than timer APIs.
 *
 * Deliberately a plain async vitest test rather than `it.effect`/TestConfect:
 * `@effect/vitest` runs the outer test fiber on Effect's default scheduler,
 * which resolves `globalThis.setImmediate` at dispatch time — stubbing the
 * globals would crash the harness fiber, not just the code under test. With
 * `convexTest` used directly, the only Effect fiber alive inside the stub
 * window is the handler fiber under test.
 */

import { Ref } from "@confect/core";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import convexSchema from "./fixtures/confect/_generated/convexSchema";
import refs from "./fixtures/confect/_generated/refs";

// Same module glob as TestConfect.ts.
const modules = import.meta.glob([
  "./fixtures/convex/**/*.ts",
  "./fixtures/convex/**/*.js",
  "!./fixtures/convex/**/*.*.*",
]);

// The fixtures sum 1..5000.
const expectedSum = (5000 * 5001) / 2;

/**
 * Simulate the Convex query/mutation isolate for the duration of `run`:
 * `setTimeout` throws Convex's error, and `setImmediate` (absent in the
 * isolate, so Effect's default scheduler would fall back to `setTimeout`)
 * throws too, so any timer use surfaces as a test failure. Effect resolves
 * both via `globalThis` property lookup at dispatch time, so swapping the
 * properties intercepts it.
 */
const withConvexIsolateTimers = async <A>(
  run: () => Promise<A>,
): Promise<A> => {
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
    return await run();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.setImmediate = originalSetImmediate;
  }
};

describe("Effect scheduler inside the Convex isolate", () => {
  it("runs a query handler exceeding the fiber op budget without timers", async () => {
    const t = convexTest(convexSchema, modules);
    const result = await withConvexIsolateTimers(() =>
      t.query(
        Ref.getFunctionReference(refs.public.groups.scheduling.manyOpsQuery),
        {},
      ),
    );
    expect(result).toBe(expectedSum);
  });

  it("runs a mutation handler exceeding the fiber op budget without timers", async () => {
    const t = convexTest(convexSchema, modules);
    const result = await withConvexIsolateTimers(() =>
      t.mutation(
        Ref.getFunctionReference(refs.public.groups.scheduling.manyOpsMutation),
        {},
      ),
    );
    expect(result).toBe(expectedSum);
  });
});
