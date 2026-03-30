import { describe, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { DateTime, Duration, Effect } from "effect";
import * as Scheduler from "../src/Scheduler";

describe("Scheduler", () => {
  it.effect("runAfter schedules with correct delay in ms", () =>
    Effect.gen(function* () {
      let capturedDelayMs: number | undefined;
      let capturedFuncRef: string | undefined;

      const fakeScheduler = {
        runAfter: async (
          delayMs: number,
          functionReference: any,
          ..._args: any[]
        ) => {
          capturedDelayMs = delayMs;
          capturedFuncRef = functionReference;
          return "scheduled-id" as any;
        },
        runAt: async () => "scheduled-id" as any,
      };

      const scheduler = yield* Scheduler.Scheduler.pipe(
        Effect.provide(Scheduler.layer(fakeScheduler as any)),
      );

      yield* scheduler.runAfter(
        Duration.seconds(30),
        "api:myFunc" as any,
        { key: "value" } as any,
      );

      assertEquals(capturedDelayMs, 30000);
      assertEquals(capturedFuncRef, "api:myFunc");
    }),
  );

  it.effect("runAt schedules with correct timestamp", () =>
    Effect.gen(function* () {
      let capturedTimestamp: number | undefined;
      let capturedFuncRef: string | undefined;

      const fakeScheduler = {
        runAfter: async () => "scheduled-id" as any,
        runAt: async (
          timestamp: number,
          functionReference: any,
          ..._args: any[]
        ) => {
          capturedTimestamp = timestamp;
          capturedFuncRef = functionReference;
          return "scheduled-id" as any;
        },
      };

      const scheduler = yield* Scheduler.Scheduler.pipe(
        Effect.provide(Scheduler.layer(fakeScheduler as any)),
      );

      const dateTime = DateTime.unsafeMake(1700000000000);
      yield* scheduler.runAt(dateTime, "api:otherFunc" as any);

      assertEquals(capturedTimestamp, 1700000000000);
      assertEquals(capturedFuncRef, "api:otherFunc");
    }),
  );
});
