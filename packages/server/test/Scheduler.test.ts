import * as Layer from "effect/Layer";
import * as Scheduler from "@confect/server/Scheduler";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { Scheduler as ConvexScheduler } from "convex/server";
import { GenericId } from "@confect/core/GenericId";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { vi } from "vitest";

const scheduledFunctionId = GenericId("_scheduled_functions").make(
  "scheduled-function-id",
);

describe("Scheduler", () => {
  it.effect("cancel delegates lazily with the scheduled function ID", () => {
    const cancel = vi
      .fn<ConvexScheduler["cancel"]>()
      .mockResolvedValue(undefined);
    const convexScheduler = {
      runAfter: () => Promise.resolve(scheduledFunctionId),
      runAt: () => Promise.resolve(scheduledFunctionId),
      cancel,
    } satisfies ConvexScheduler;

    return Effect.gen(function* () {
      const services = yield* Layer.build(Scheduler.layer(convexScheduler));
      return yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler.Scheduler;
        const cancellation = scheduler.cancel(scheduledFunctionId);

        expectTypeOf(scheduler.cancel)
          .parameter(0)
          .toEqualTypeOf<GenericId<"_scheduled_functions">>();
        expectTypeOf(cancellation).toEqualTypeOf<Effect.Effect<void>>();
        expect(cancel).not.toHaveBeenCalled();

        const cancellationResult = yield* cancellation;
        expect(cancellationResult).toBeUndefined();
        expect(cancel).toHaveBeenCalledExactlyOnceWith(scheduledFunctionId);
        expect(cancel.mock.contexts[0]).toBe(convexScheduler);
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped);
  });

  it.effect("cancel preserves unexpected Convex failures as defects", () => {
    const failure = new Error("Convex cancellation failed");
    const convexScheduler = {
      runAfter: () => Promise.resolve(scheduledFunctionId),
      runAt: () => Promise.resolve(scheduledFunctionId),
      cancel: () => Promise.reject(failure),
    } satisfies ConvexScheduler;

    return Effect.gen(function* () {
      const services = yield* Layer.build(Scheduler.layer(convexScheduler));
      return yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler.Scheduler;
        const exit = yield* Effect.exit(scheduler.cancel(scheduledFunctionId));

        expect(exit).toEqual(Exit.die(failure));
      }).pipe(Effect.provideContext(services));
    }).pipe(Effect.scoped);
  });
});
