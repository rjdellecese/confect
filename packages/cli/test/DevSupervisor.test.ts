import * as DevSessionProcess from "@confect/cli/DevSessionProcess";
import * as DevSupervisor from "@confect/cli/DevSupervisor";
import { assert, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";

const parentConfig = ConfigProvider.layer(ConfigProvider.fromUnknown({}));
const childConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    CONFECT_INTERNAL_DEV_SESSION: "1",
  }),
);

it.effect(
  "restarts only after the previous session has released its scope",
  () =>
    Effect.gen(function* () {
      const events = yield* Ref.make<ReadonlyArray<string>>([]);
      const attempts = yield* Ref.make(0);
      const processes = Layer.succeed(DevSessionProcess.Service, {
        connectToParent: Effect.die(
          "The supervisor must not connect to a parent",
        ),
        runSession: Effect.scoped(
          Effect.gen(function* () {
            const attempt = yield* Ref.updateAndGet(attempts, (n) => n + 1);
            yield* Ref.update(events, (xs) => [...xs, `start:${attempt}`]);
            yield* Effect.addFinalizer(() =>
              Ref.update(events, (xs) => [...xs, `stop:${attempt}`]),
            );
            return attempt === 1;
          }),
        ),
      });
      yield* DevSupervisor.run(
        Effect.die("The parent must not evaluate the session"),
      ).pipe(Effect.provide([processes, parentConfig]));
      expect(yield* Ref.get(events)).toEqual([
        "start:1",
        "stop:1",
        "start:2",
        "stop:2",
      ]);
    }),
);

it.effect("propagates process failures without retrying", () =>
  Effect.gen(function* () {
    const attempts = yield* Ref.make(0);
    const failure = new DevSessionProcess.SessionExited({
      code: 23,
      signal: null,
    });
    const processes = Layer.succeed(DevSessionProcess.Service, {
      connectToParent: Effect.die("Unexpected parent connection"),
      runSession: Ref.update(attempts, (n) => n + 1).pipe(
        Effect.andThen(Effect.fail(failure)),
      ),
    });
    expect(
      yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide([processes, parentConfig]),
        Effect.result,
      ),
    ).toEqual(Result.fail(failure));
    expect(yield* Ref.get(attempts)).toBe(1);
  }),
);

const childHarness = Effect.gen(function* () {
  const events = yield* Queue.unbounded<string>();
  const disconnected = yield* Deferred.make<never>();
  const acknowledged = yield* Deferred.make<void>();
  const layer = Layer.succeed(DevSessionProcess.Service, {
    runSession: Effect.die("A child must not spawn another session"),
    connectToParent: Effect.acquireRelease(
      Effect.succeed({
        disconnected: Deferred.await(disconnected),
        requestRestart: Queue.offer(events, "restart").pipe(
          Effect.andThen(Deferred.await(acknowledged)),
        ),
      }),
      () => Queue.offer(events, "disconnect"),
    ),
  });
  return { events, disconnected, acknowledged, layer };
});

it.effect(
  "releases the session before requesting restart and awaits acknowledgement",
  () =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const allowCleanup = yield* Deferred.make<void>();
      const session = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Queue.offer(harness.events, "cleanup").pipe(
            Effect.andThen(Deferred.await(allowCleanup)),
          ),
        );
        return yield* DevSupervisor.requestRestart;
      });
      const fiber = yield* DevSupervisor.run(session).pipe(
        Effect.provide([harness.layer, childConfig]),
        Effect.forkScoped,
      );
      expect(yield* Queue.take(harness.events)).toBe("cleanup");
      expect(yield* Queue.size(harness.events)).toBe(0);
      yield* Deferred.succeed(allowCleanup, undefined);
      expect(yield* Queue.take(harness.events)).toBe("restart");
      expect(yield* Queue.size(harness.events)).toBe(0);
      yield* Deferred.succeed(harness.acknowledged, undefined);
      yield* Fiber.join(fiber);
      expect(yield* Queue.take(harness.events)).toBe("disconnect");
    }).pipe(Effect.scoped),
);

it.effect.each(["complete", "fail", "defect"] as const)(
  "does not restart on %s",
  (mode) =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const failure = new DevSessionProcess.MissingSessionIpc();
      const session =
        mode === "complete"
          ? Effect.void
          : mode === "fail"
            ? Effect.fail(failure)
            : Effect.die(failure);
      const exit = yield* DevSupervisor.run(session).pipe(
        Effect.provide([harness.layer, childConfig]),
        Effect.exit,
      );
      if (mode === "complete") expect(Exit.isSuccess(exit)).toBe(true);
      else {
        assert(Exit.isFailure(exit));
        expect(
          mode === "fail"
            ? Cause.hasFails(exit.cause)
            : Cause.hasDies(exit.cause),
        ).toBe(true);
      }
      expect(yield* Queue.take(harness.events)).toBe("disconnect");
      expect(yield* Queue.size(harness.events)).toBe(0);
    }),
);

it.effect("preserves a cleanup defect alongside a restart request", () =>
  Effect.gen(function* () {
    const harness = yield* childHarness;
    const session = Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.die("cleanup failed"));
      return yield* DevSupervisor.requestRestart;
    });
    const exit = yield* DevSupervisor.run(session).pipe(
      Effect.provide([harness.layer, childConfig]),
      Effect.exit,
    );
    assert(Exit.isFailure(exit));
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(Cause.hasFails(exit.cause)).toBe(true);
    expect(yield* Queue.take(harness.events)).toBe("disconnect");
    expect(yield* Queue.size(harness.events)).toBe(0);
  }),
);

it.effect(
  "interrupts and cleans up the session when its parent disconnects",
  () =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const session = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Queue.offer(harness.events, "cleanup"),
        );
        yield* Queue.offer(harness.events, "start");
        return yield* Effect.never;
      });
      const fiber = yield* DevSupervisor.run(session).pipe(
        Effect.provide([harness.layer, childConfig]),
        Effect.forkScoped,
      );
      expect(yield* Queue.take(harness.events)).toBe("start");
      yield* Deferred.interrupt(harness.disconnected);
      const exit = yield* Fiber.await(fiber);
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(yield* Queue.take(harness.events)).toBe("cleanup");
      expect(yield* Queue.take(harness.events)).toBe("disconnect");
      expect(yield* Queue.size(harness.events)).toBe(0);
    }).pipe(Effect.scoped),
);
