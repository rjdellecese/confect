import * as Scheduler from "@confect/server/Scheduler";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { Scheduler as ConvexScheduler } from "convex/server";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import { vi } from "vitest";

const scheduledFunctionId =
  "scheduled-function-id" as GenericId<"_scheduled_functions">;

describe("Scheduler", () => {
  it.effect("cancel delegates lazily with the scheduled function ID", () => {
    const cancel = vi.fn(() => Promise.resolve());
    const convexScheduler = {
      runAfter: () => Promise.resolve(scheduledFunctionId),
      runAt: () => Promise.resolve(scheduledFunctionId),
      cancel,
    } satisfies ConvexScheduler;

    return Effect.gen(function* () {
      const scheduler = yield* Scheduler.Scheduler;
      const cancellation = scheduler.cancel(scheduledFunctionId);

      expectTypeOf(scheduler.cancel)
        .parameter(0)
        .toEqualTypeOf<GenericId<"_scheduled_functions">>();
      expectTypeOf(cancellation).toEqualTypeOf<
        Effect.Effect<void, Scheduler.SchedulerCancelError>
      >();
      expect(cancel).not.toHaveBeenCalled();

      expect(yield* cancellation).toBeUndefined();
      expect(cancel).toHaveBeenCalledExactlyOnceWith(scheduledFunctionId);
      expect(cancel.mock.contexts[0]).toBe(convexScheduler);
    }).pipe(Effect.provide(Scheduler.layer(convexScheduler)));
  });

  it.effect("cancel fails with the scheduled ID and original cause", () => {
    const failure = new Error("Scheduled function already completed");
    const convexScheduler = {
      runAfter: () => Promise.resolve(scheduledFunctionId),
      runAt: () => Promise.resolve(scheduledFunctionId),
      cancel: () => Promise.reject(failure),
    } satisfies ConvexScheduler;

    return Effect.gen(function* () {
      const scheduler = yield* Scheduler.Scheduler;
      const error = yield* Effect.flip(scheduler.cancel(scheduledFunctionId));

      expectTypeOf(error).toEqualTypeOf<Scheduler.SchedulerCancelError>();
      expect(error).toBeInstanceOf(Scheduler.SchedulerCancelError);
      expect(error._tag).toBe("SchedulerCancelError");
      expect(error.id).toBe(scheduledFunctionId);
      expect(error.cause).toBe(failure);
      expect(error.message).toContain(scheduledFunctionId);
    }).pipe(Effect.provide(Scheduler.layer(convexScheduler)));
  });

  it.effect("cancel failures can be recovered with catchTag", () => {
    const failure = "Cancellation rejected";
    const convexScheduler = {
      runAfter: () => Promise.resolve(scheduledFunctionId),
      runAt: () => Promise.resolve(scheduledFunctionId),
      cancel: () => Promise.reject(failure),
    } satisfies ConvexScheduler;

    return Effect.gen(function* () {
      const scheduler = yield* Scheduler.Scheduler;
      const recovered = yield* scheduler.cancel(scheduledFunctionId).pipe(
        Effect.catchTag("SchedulerCancelError", (error) => {
          expect(error.cause).toBe(failure);
          return Effect.succeed(error.id);
        }),
      );

      expect(recovered).toBe(scheduledFunctionId);
    }).pipe(Effect.provide(Scheduler.layer(convexScheduler)));
  });

  it.effect("cancel captures synchronous throws in the error channel", () => {
    const failure = new Error("Invalid scheduled function ID");
    const convexScheduler = {
      runAfter: () => Promise.resolve(scheduledFunctionId),
      runAt: () => Promise.resolve(scheduledFunctionId),
      cancel: () => {
        throw failure;
      },
    } satisfies ConvexScheduler;

    return Effect.gen(function* () {
      const scheduler = yield* Scheduler.Scheduler;
      const error = yield* Effect.flip(scheduler.cancel(scheduledFunctionId));

      expect(error).toBeInstanceOf(Scheduler.SchedulerCancelError);
      expect(error.id).toBe(scheduledFunctionId);
      expect(error.cause).toBe(failure);
    }).pipe(Effect.provide(Scheduler.layer(convexScheduler)));
  });
});
