import type { Scheduler as ConvexScheduler } from "convex/server";
import type { GenericId } from "convex/values";
import { describe, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { DateTime, Duration, Effect, Ref } from "effect";
import * as Scheduler from "../src/Scheduler";

interface ScheduledCall {
  readonly method: "runAfter" | "runAt";
  readonly timeValue: number;
  readonly functionReference: string;
}

const testSchedulerLayer = () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<ScheduledCall>>([]);

    const convexScheduler: ConvexScheduler = {
      runAfter: (delayMs, functionReference, ..._args) => {
        const call: ScheduledCall = {
          method: "runAfter",
          timeValue: delayMs,
          functionReference: String(functionReference),
        };
        Effect.runSync(Ref.update(calls, (prev) => [...prev, call]));
        return Promise.resolve(
          "scheduled" as unknown as GenericId<"_scheduled_functions">,
        );
      },
      runAt: (timestamp, functionReference, ..._args) => {
        const call: ScheduledCall = {
          method: "runAt",
          timeValue:
            typeof timestamp === "number" ? timestamp : timestamp.getTime(),
          functionReference: String(functionReference),
        };
        Effect.runSync(Ref.update(calls, (prev) => [...prev, call]));
        return Promise.resolve(
          "scheduled" as unknown as GenericId<"_scheduled_functions">,
        );
      },
      cancel: () => Promise.resolve(),
    };

    return { layer: Scheduler.layer(convexScheduler), calls };
  });

describe("Scheduler", () => {
  it.effect("runAfter schedules with correct delay in ms", () =>
    Effect.gen(function* () {
      const { layer, calls } = yield* testSchedulerLayer();

      yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler.Scheduler;
        yield* scheduler.runAfter(Duration.seconds(30), "api:myFunc" as any);
      }).pipe(Effect.provide(layer));

      const recorded = yield* Ref.get(calls);
      assertEquals(recorded.length, 1);
      assertEquals(recorded[0]?.method, "runAfter");
      assertEquals(recorded[0]?.timeValue, 30000);
      assertEquals(recorded[0]?.functionReference, "api:myFunc");
    }),
  );

  it.effect("runAt schedules with correct timestamp", () =>
    Effect.gen(function* () {
      const { layer, calls } = yield* testSchedulerLayer();

      yield* Effect.gen(function* () {
        const scheduler = yield* Scheduler.Scheduler;
        yield* scheduler.runAt(
          DateTime.unsafeMake(1700000000000),
          "api:otherFunc" as any,
        );
      }).pipe(Effect.provide(layer));

      const recorded = yield* Ref.get(calls);
      assertEquals(recorded.length, 1);
      assertEquals(recorded[0]?.method, "runAt");
      assertEquals(recorded[0]?.timeValue, 1700000000000);
      assertEquals(recorded[0]?.functionReference, "api:otherFunc");
    }),
  );
});
