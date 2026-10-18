import { ChildProcess, fork } from "node:child_process";
import type * as NodeChildProcess from "node:child_process";
import * as DevSupervisor from "@confect/cli/DevSupervisor";
import { assert, expect, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import { vi } from "vitest";

vi.mock("node:child_process", (importOriginal) =>
  importOriginal<typeof NodeChildProcess>().then((original) => ({
    ...original,
    fork: vi.fn(),
  })),
);

const restartSignal = { _tag: "ConfectDevSessionRestart" };
const parentConfig = ConfigProvider.layer(ConfigProvider.fromUnknown({}));
const childConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    CONFECT_INTERNAL_DEV_SESSION: "1",
  }),
);

const parentHarness = Effect.gen(function* () {
  const runSync = Effect.runSyncWith(yield* Effect.context());
  const started = yield* Queue.unbounded<ChildProcess>();
  const stopping = yield* Queue.unbounded<ChildProcess>();
  const signals = yield* Queue.unbounded<NodeJS.Signals | number>();
  const spawn = yield* Effect.acquireRelease(
    Effect.sync(() =>
      vi.mocked(fork).mockImplementation(() => {
        const child = new ChildProcess();
        const connected = runSync(Ref.make(true));
        Object.defineProperties(child, {
          connected: {
            configurable: true,
            get: () => runSync(Ref.get(connected)),
          },
          disconnect: {
            configurable: true,
            writable: true,
            value: () => {
              runSync(Ref.set(connected, false));
              runSync(Queue.offer(stopping, child));
            },
          },
        });
        vi.spyOn(child, "kill").mockImplementation((signal = "SIGTERM") => {
          runSync(Queue.offer(signals, signal));
          if (signal === "SIGKILL") child.emit("close", null, "SIGKILL");
          return true;
        });
        runSync(Queue.offer(started, child));
        return child;
      }),
    ),
    (mock) =>
      Effect.sync(() => {
        mock.mockReset();
      }),
  );
  return { started, stopping, signals, spawn };
});

const childHarness = Effect.gen(function* () {
  const runSync = Effect.runSyncWith(yield* Effect.context());
  const sent = yield* Deferred.make<(error: Error | null) => void>();
  const send = vi.fn(
    (message: unknown, callback: (error: Error | null) => void) => {
      expect(message).toEqual(restartSignal);
      runSync(Deferred.succeed(sent, callback));
      return true;
    },
  );
  const connected = yield* Ref.make(true);
  const disconnect = vi.fn(() => {
    runSync(Ref.set(connected, false));
    process.emit("disconnect");
  });
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const descriptors = Array.map(
        ["send", "connected", "disconnect"] as const,
        (name) =>
          [name, Object.getOwnPropertyDescriptor(process, name)] as const,
      );
      Object.defineProperties(process, {
        send: { configurable: true, value: send },
        connected: {
          configurable: true,
          get: () => runSync(Ref.get(connected)),
        },
        disconnect: { configurable: true, value: disconnect },
      });
      return descriptors;
    }),
    (descriptors) =>
      Effect.sync(() => {
        for (const [name, descriptor] of descriptors) {
          if (descriptor) Object.defineProperty(process, name, descriptor);
          else Reflect.deleteProperty(process, name);
        }
      }),
  );
  return { sent, send, disconnect };
});

it.effect(
  "waits for child close before restarting without overlapping sessions",
  () =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const fiber = yield* DevSupervisor.run(
        Effect.die("The parent must not evaluate the session"),
      ).pipe(Effect.provide(parentConfig), Effect.forkScoped);
      const first = yield* Queue.take(harness.started);
      const unrelated = vi.fn();
      first.on("message", unrelated);
      const invocation = harness.spawn.mock.calls[0];
      assert(invocation);
      expect(invocation[0]).toBe(process.argv[1]);
      expect(invocation[1]).toEqual(process.argv.slice(2));
      const options = invocation[2];
      assert(options);
      expect(options.execArgv).toEqual(process.execArgv);
      expect(options.stdio).toEqual(["inherit", "inherit", "inherit", "ipc"]);
      expect(options.env?.CONFECT_INTERNAL_DEV_SESSION).toBe("1");
      expect(
        Array.every(
          Object.entries(process.env),
          ([key, value]) =>
            key === "CONFECT_INTERNAL_DEV_SESSION" ||
            options.env?.[key] === value,
        ),
      ).toBe(true);
      first.emit("message", restartSignal);
      first.emit("message", restartSignal);
      yield* Effect.yieldNow;
      expect(harness.spawn).toHaveBeenCalledTimes(1);
      first.emit("exit", 0, null);
      yield* Effect.yieldNow;
      expect(harness.spawn).toHaveBeenCalledTimes(1);
      first.emit("close", 0, null);
      const second = yield* Queue.take(harness.started);
      expect(first.listeners("message")).toEqual([unrelated]);
      expect(harness.spawn).toHaveBeenCalledTimes(2);
      expect(yield* Queue.size(harness.signals)).toBe(0);
      second.emit("close", 0, null);
      yield* Fiber.join(fiber);
      expect(yield* Queue.size(harness.signals)).toBe(0);
      expect(harness.spawn).toHaveBeenCalledTimes(2);
    }).pipe(Effect.scoped),
);

it.effect.each([undefined, "ConfectDevSessionRestart", { _tag: "Other" }])(
  "does not restart an ordinary exit or interpret unrelated message %j",
  (message) =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(parentConfig),
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      child.emit("message", message);
      child.emit("close", 0, null);
      yield* Fiber.join(fiber);
      expect(harness.spawn).toHaveBeenCalledTimes(1);
    }).pipe(Effect.scoped),
);

it.effect.each([
  { code: 23, signal: null, restart: false },
  { code: 23, signal: null, restart: true },
  { code: null, signal: "SIGTERM", restart: true },
])(
  "propagates child exit $code/$signal without retrying failures",
  ({ code, signal, restart }) =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(parentConfig),
        Effect.result,
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      if (restart) child.emit("message", restartSignal);
      child.emit("close", code, signal);
      expect(yield* Fiber.join(fiber)).toEqual(
        Result.fail(new DevSupervisor.SessionExited({ code, signal })),
      );
      expect(harness.spawn).toHaveBeenCalledTimes(1);
    }).pipe(Effect.scoped),
);

it.effect("propagates a spawn failure without retrying", () =>
  Effect.gen(function* () {
    const harness = yield* parentHarness;
    const failure = new Error("spawn failed");
    harness.spawn.mockImplementationOnce(() => {
      throw failure;
    });
    expect(
      yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(parentConfig),
        Effect.result,
      ),
    ).toEqual(
      Result.fail(
        new DevSupervisor.SupervisorError({
          operation: "Spawn",
          cause: failure,
        }),
      ),
    );
    expect(harness.spawn).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect(
  "waits for termination on interruption instead of leaving an orphan child",
  () =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const finished = yield* Deferred.make<void>();
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(parentConfig),
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      child.emit("message", restartSignal);
      const interrupt = yield* Fiber.interrupt(fiber).pipe(
        Effect.tap(() => Deferred.succeed(finished, undefined)),
        Effect.forkScoped,
      );
      expect(yield* Queue.take(harness.stopping)).toBe(child);
      expect(yield* Deferred.isDone(finished)).toBe(false);
      child.emit("close", null, "SIGTERM");
      yield* Fiber.join(interrupt);
      const exit = yield* Effect.exit(Fiber.join(fiber));
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(harness.spawn).toHaveBeenCalledTimes(1);
    }).pipe(Effect.scoped),
);

it.effect("waits for process cleanup after an asynchronous spawn error", () =>
  Effect.gen(function* () {
    const harness = yield* parentHarness;
    const finished = yield* Deferred.make<void>();
    const failure = new Error("child process error");
    const fiber = yield* DevSupervisor.run(Effect.void).pipe(
      Effect.provide(parentConfig),
      Effect.result,
      Effect.tap(() => Deferred.succeed(finished, undefined)),
      Effect.forkScoped,
    );
    const child = yield* Queue.take(harness.started);
    child.emit("error", failure);
    expect(yield* Queue.take(harness.stopping)).toBe(child);
    expect(yield* Deferred.isDone(finished)).toBe(false);
    child.emit("close", 1, null);
    expect(yield* Fiber.join(fiber)).toEqual(
      Result.fail(
        new DevSupervisor.SupervisorError({
          operation: "Spawn",
          cause: failure,
        }),
      ),
    );
    expect(harness.spawn).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect("still reaps the child if disconnect fails during interruption", () =>
  Effect.gen(function* () {
    const harness = yield* parentHarness;
    const fiber = yield* DevSupervisor.run(Effect.void).pipe(
      Effect.provide(parentConfig),
      Effect.forkScoped,
    );
    const child = yield* Queue.take(harness.started);
    vi.spyOn(child, "disconnect").mockImplementation(() => {
      throw new Error("disconnect failed");
    });
    yield* Fiber.interrupt(fiber);
    expect(yield* Queue.take(harness.signals)).toBe("SIGKILL");
    const exit = yield* Effect.exit(Fiber.join(fiber));
    assert(Exit.isFailure(exit));
    expect(Cause.hasInterrupts(exit.cause)).toBe(true);
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect("force-terminates a child that ignores graceful shutdown", () =>
  Effect.gen(function* () {
    const harness = yield* parentHarness;
    const fiber = yield* DevSupervisor.run(Effect.void).pipe(
      Effect.provide(parentConfig),
      Effect.forkScoped,
    );
    const child = yield* Queue.take(harness.started);
    const interrupt = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped);
    expect(yield* Queue.take(harness.stopping)).toBe(child);
    yield* TestClock.adjust("5 seconds");
    expect(yield* Queue.take(harness.signals)).toBe("SIGKILL");
    yield* Fiber.join(interrupt);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect.each([
  { mode: "throw", reason: "SignalFailed" },
  { mode: "reject", reason: "SignalRejected" },
  { mode: "accept", reason: "CloseTimeout" },
] as const)(
  "reports $reason if forced termination cannot confirm child close",
  ({ mode, reason }) =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const runSync = Effect.runSyncWith(yield* Effect.context());
      const attempted = yield* Deferred.make<void>();
      const finished = yield* Deferred.make<void>();
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(parentConfig),
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      vi.spyOn(child, "kill").mockImplementation(() => {
        runSync(Deferred.succeed(attempted, undefined));
        if (mode === "throw") throw new Error("kill failed");
        return mode === "accept";
      });
      const interrupt = yield* Fiber.interrupt(fiber).pipe(
        Effect.tap(() => Deferred.succeed(finished, undefined)),
        Effect.forkScoped,
      );
      yield* Queue.take(harness.stopping);
      yield* TestClock.adjust("5 seconds");
      yield* Deferred.await(attempted);
      expect(yield* Deferred.isDone(finished)).toBe(false);
      yield* TestClock.adjust("5 seconds");
      yield* Fiber.join(interrupt);
      const exit = yield* Effect.exit(Fiber.join(fiber));
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      const defect = Cause.findDefect(exit.cause);
      assert(Result.isSuccess(defect));
      expect(defect.success).toMatchObject({
        _tag: "DevSessionTerminationError",
        reason,
        pid: null,
      });
      expect(harness.spawn).toHaveBeenCalledTimes(1);
    }).pipe(Effect.scoped),
);

it.effect("rejects a private session marker without an IPC send function", () =>
  Effect.gen(function* () {
    const harness = yield* childHarness;
    Object.defineProperty(process, "send", {
      configurable: true,
      value: undefined,
    });
    const executed = yield* Ref.make(false);
    const result = yield* DevSupervisor.run(Ref.set(executed, true)).pipe(
      Effect.provide(childConfig),
      Effect.result,
    );
    expect(result).toEqual(Result.fail(new DevSupervisor.MissingSessionIpc()));
    expect(yield* Ref.get(executed)).toBe(false);
    expect(harness.disconnect).not.toHaveBeenCalled();
  }).pipe(Effect.scoped),
);

it.effect(
  "interrupts an already disconnected real child without starting a session",
  () =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      harness.disconnect();
      const executed = yield* Ref.make(false);
      const exit = yield* DevSupervisor.run(Ref.set(executed, true)).pipe(
        Effect.provide(childConfig),
        Effect.exit,
      );
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(yield* Ref.get(executed)).toBe(false);
      expect(harness.send).not.toHaveBeenCalled();
    }).pipe(Effect.scoped),
);

it.effect(
  "sends the typed restart only after scoped cleanup and awaits IPC acknowledgement",
  () =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const cleaning = yield* Deferred.make<void>();
      const allowCleanup = yield* Deferred.make<void>();
      const cleaned = yield* Ref.make(false);
      const finished = yield* Deferred.make<void>();
      const session = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(cleaning, undefined).pipe(
            Effect.andThen(Deferred.await(allowCleanup)),
            Effect.andThen(Ref.set(cleaned, true)),
          ),
        );
        return yield* DevSupervisor.requestRestart;
      });
      const fiber = yield* DevSupervisor.run(session).pipe(
        Effect.provide(childConfig),
        Effect.tap(() => Deferred.succeed(finished, undefined)),
        Effect.forkScoped,
      );
      yield* Deferred.await(cleaning);
      expect(harness.send).not.toHaveBeenCalled();
      expect(harness.disconnect).not.toHaveBeenCalled();
      yield* Deferred.succeed(allowCleanup, undefined);
      const acknowledge = yield* Deferred.await(harness.sent);
      expect(yield* Ref.get(cleaned)).toBe(true);
      expect(yield* Deferred.isDone(finished)).toBe(false);
      expect(harness.disconnect).not.toHaveBeenCalled();
      acknowledge(null);
      yield* Fiber.join(fiber);
      expect(harness.send).toHaveBeenCalledTimes(1);
      expect(harness.disconnect).toHaveBeenCalledTimes(1);
    }).pipe(Effect.scoped),
);

it.effect("does not request restart when scope cleanup defects", () =>
  Effect.gen(function* () {
    const harness = yield* childHarness;
    const session = Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.die("cleanup failed"));
      return yield* DevSupervisor.requestRestart;
    });
    const exit = yield* DevSupervisor.run(session).pipe(
      Effect.provide(childConfig),
      Effect.exit,
    );
    assert(Exit.isFailure(exit));
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(Cause.hasFails(exit.cause)).toBe(true);
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect(
  "does not convert interruption during restart cleanup into another restart",
  () =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const cleaning = yield* Deferred.make<void>();
      const allowCleanup = yield* Deferred.make<void>();
      const session = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(cleaning, undefined).pipe(
            Effect.andThen(Deferred.await(allowCleanup)),
          ),
        );
        return yield* DevSupervisor.requestRestart;
      });
      const fiber = yield* DevSupervisor.run(session).pipe(
        Effect.provide(childConfig),
        Effect.forkScoped,
      );
      yield* Deferred.await(cleaning);
      const interrupt = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(allowCleanup, undefined);
      yield* Fiber.join(interrupt);
      const exit = yield* Effect.exit(Fiber.join(fiber));
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      expect(harness.send).not.toHaveBeenCalled();
      expect(harness.disconnect).toHaveBeenCalledTimes(1);
    }).pipe(Effect.scoped),
);
it.effect("propagates session failures without requesting restart", () =>
  Effect.gen(function* () {
    const harness = yield* childHarness;
    const failure = new DevSupervisor.SessionExited({ code: 7, signal: null });
    expect(
      yield* DevSupervisor.run(Effect.fail(failure)).pipe(
        Effect.provide(childConfig),
        Effect.result,
      ),
    ).toEqual(Result.fail(failure));
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect("disconnects normally without sending a restart", () =>
  Effect.gen(function* () {
    const harness = yield* childHarness;
    yield* DevSupervisor.run(Effect.void).pipe(Effect.provide(childConfig));
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect("propagates IPC send failures instead of silently restarting", () =>
  Effect.gen(function* () {
    const harness = yield* childHarness;
    const fiber = yield* DevSupervisor.run(DevSupervisor.requestRestart).pipe(
      Effect.provide(childConfig),
      Effect.result,
      Effect.forkScoped,
    );
    const acknowledge = yield* Deferred.await(harness.sent);
    const failure = new Error("IPC send failed");
    acknowledge(failure);
    expect(yield* Fiber.join(fiber)).toEqual(
      Result.fail(
        new DevSupervisor.SupervisorError({
          operation: "Restart",
          cause: failure,
        }),
      ),
    );
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  }).pipe(Effect.scoped),
);

it.effect.each(["interrupt", "disconnect"] as const)(
  "preserves child interruption on %s and closes its scope",
  (reason) =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const started = yield* Deferred.make<void>();
      const cleaned = yield* Ref.make(false);
      const listeners = process.listenerCount("disconnect");
      const session = Effect.gen(function* () {
        yield* Effect.addFinalizer(() => Ref.set(cleaned, true));
        yield* Deferred.succeed(started, undefined);
        return yield* Effect.never;
      });
      const fiber = yield* DevSupervisor.run(session).pipe(
        Effect.provide(childConfig),
        Effect.forkScoped,
      );
      yield* Deferred.await(started);
      if (reason === "interrupt") yield* Fiber.interrupt(fiber);
      else harness.disconnect();
      const exit = yield* Effect.exit(Fiber.join(fiber));
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(yield* Ref.get(cleaned)).toBe(true);
      expect(harness.send).not.toHaveBeenCalled();
      expect(harness.disconnect).toHaveBeenCalledTimes(1);
      expect(process.listenerCount("disconnect")).toBe(listeners);
    }).pipe(Effect.scoped),
);
