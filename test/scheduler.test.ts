import { describe, vi } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { DateTime, Duration, Effect, Schema } from "effect";
import { api } from "./convex/_generated/api";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("ConfectScheduler", () => {
  effect("runAfter", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;
      yield* Effect.sync(() => vi.useFakeTimers());

      const text = "Hello, world!";
      const millisDuration = Duration.seconds(1);
      const millisEncoded = yield* Schema.encode(Schema.Duration)(
        millisDuration,
      );
      const millisNumber = Duration.toMillis(millisDuration);

      yield* c.action(api.scheduler.insertAfter, {
        text,
        millis: millisEncoded,
      });

      {
        const note = yield* c.run(({ db }) => db.query("notes").first());

        assertEquals(note, null);
      }

      yield* Effect.sync(() => vi.advanceTimersByTime(millisNumber));
      yield* c.finishInProgressScheduledFunctions();

      {
        const note = yield* c.run(({ db }) => db.query("notes").first());

        assertEquals(note?.text, text);
      }
    }),
  );

  effect("runAt", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;
      yield* Effect.sync(() => vi.useFakeTimers());

      const text = "Hello, world!";

      const now = yield* DateTime.now;
      const timestamp = DateTime.addDuration(now, Duration.seconds(1));
      const timestampEncoded = yield* Schema.encode(Schema.DateTimeUtc)(
        timestamp,
      );

      yield* c.action(api.scheduler.insertAt, {
        text,
        timestamp: timestampEncoded,
      });

      yield* c.finishAllScheduledFunctions(vi.runAllTimers);

      const note = yield* c.run(({ db }) => db.query("notes").first());

      assertEquals(note?.text, text);
    }),
  );
});
