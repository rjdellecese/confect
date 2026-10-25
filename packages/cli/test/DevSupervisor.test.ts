import * as DevSupervisor from "@confect/cli/DevSupervisor";
import { assert, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Runtime from "effect/Runtime";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as TestClock from "effect/testing/TestClock";

const parentConfig = ConfigProvider.layer(ConfigProvider.fromUnknown({}));
const childConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    CONFECT_INTERNAL_DEV_SESSION: "1",
  }),
);

const parentHarness = Effect.gen(function* () {
  const started = yield* Queue.unbounded<{
    command: ChildProcess.StandardCommand;
    exited: Deferred.Deferred<
      ChildProcessSpawner.ExitCode,
      PlatformError.PlatformError
    >;
    stopping: Deferred.Deferred<void>;
    released: Deferred.Deferred<void>;
  }>();
  const spawn = Effect.fnUntraced(function* (command: ChildProcess.Command) {
    assert(ChildProcess.isStandardCommand(command));
    const exited = yield* Deferred.make<
      ChildProcessSpawner.ExitCode,
      PlatformError.PlatformError
    >();
    const stopping = yield* Deferred.make<void>();
    const released = yield* Deferred.make<void>();
    yield* Effect.addFinalizer(() => Deferred.succeed(released, undefined));
    const input = command.options.stdin;
    assert(Stream.isStream(input));
    yield* input.pipe(
      Stream.runDrain,
      Effect.andThen(Deferred.succeed(stopping, undefined)),
      Effect.forkScoped,
    );
    yield* Queue.offer(started, { command, exited, stopping, released });
    return ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(1),
      exitCode: Deferred.await(exited),
      isRunning: Deferred.isDone(exited).pipe(Effect.map((done) => !done)),
      kill: () => Effect.die("Termination belongs to the platform scope"),
      stdin: Sink.drain,
      stdout: Stream.empty,
      stderr: Stream.empty,
      all: Stream.empty,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });
  });
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(spawn),
  );
  return {
    started,
    layer: Layer.mergeAll(
      layer,
      parentConfig,
      Stdio.layerTest({
        args: Effect.succeed(["dev", "--component-dir", "counter"]),
      }),
    ),
  };
});

it.effect("restarts only after child exit and platform scope release", () =>
  Effect.gen(function* () {
    const harness = yield* parentHarness;
    const fiber = yield* DevSupervisor.run(
      Effect.die("The parent must not evaluate the session"),
    ).pipe(Effect.provide(harness.layer), Effect.forkScoped);
    const first = yield* Queue.take(harness.started);
    expect(first.command.command).toBe(process.execPath);
    expect(first.command.args).toEqual([
      ...process.execArgv,
      process.argv[1],
      "dev",
      "--component-dir",
      "counter",
    ]);
    expect(first.command.options).toMatchObject({
      env: { CONFECT_INTERNAL_DEV_SESSION: "1" },
      extendEnv: true,
      stdout: "inherit",
      stderr: "inherit",
      forceKillAfter: "5 seconds",
    });
    expect(yield* Queue.size(harness.started)).toBe(0);
    yield* Deferred.succeed(first.exited, ChildProcessSpawner.ExitCode(75));
    const second = yield* Queue.take(harness.started);
    expect(yield* Deferred.isDone(first.released)).toBe(true);
    yield* Deferred.succeed(second.exited, ChildProcessSpawner.ExitCode(0));
    yield* Fiber.join(fiber);
    expect(yield* Deferred.isDone(second.released)).toBe(true);
    expect(yield* Queue.size(harness.started)).toBe(0);
  }).pipe(Effect.scoped),
);

it.effect.each([1, 23, 130])(
  "propagates exit code %i without retrying",
  (code) =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(harness.layer),
        Effect.result,
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      yield* Deferred.succeed(child.exited, ChildProcessSpawner.ExitCode(code));
      expect(yield* Fiber.join(fiber)).toEqual(
        Result.fail(new DevSupervisor.SessionExited({ code })),
      );
      expect(yield* Deferred.isDone(child.released)).toBe(true);
      expect(yield* Queue.size(harness.started)).toBe(0);
    }).pipe(Effect.scoped),
);

it.effect("propagates a platform spawn failure without retrying", () =>
  Effect.gen(function* () {
    const attempts = yield* Ref.make(0);
    const failure = PlatformError.systemError({
      _tag: "Unknown",
      module: "ChildProcess",
      method: "spawn",
      cause: "spawn failed",
    });
    const spawner = Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() =>
        Ref.update(attempts, (n) => n + 1).pipe(
          Effect.andThen(Effect.fail(failure)),
        ),
      ),
    );
    expect(
      yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide([spawner, parentConfig, Stdio.layerTest({})]),
        Effect.result,
      ),
    ).toEqual(Result.fail(failure));
    expect(yield* Ref.get(attempts)).toBe(1);
  }),
);

it.effect("preserves platform exit failures and releases the child", () =>
  Effect.gen(function* () {
    const harness = yield* parentHarness;
    const failure = PlatformError.systemError({
      _tag: "Unknown",
      module: "ChildProcess",
      method: "exitCode",
      cause: "child terminated by signal",
    });
    const fiber = yield* DevSupervisor.run(Effect.void).pipe(
      Effect.provide(harness.layer),
      Effect.result,
      Effect.forkScoped,
    );
    const child = yield* Queue.take(harness.started);
    yield* Deferred.fail(child.exited, failure);
    expect(yield* Fiber.join(fiber)).toEqual(Result.fail(failure));
    expect(yield* Deferred.isDone(child.released)).toBe(true);
    expect(yield* Queue.size(harness.started)).toBe(0);
  }).pipe(Effect.scoped),
);

it.effect(
  "closes the shutdown pipe and waits for graceful exit before releasing the platform scope",
  () =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(harness.layer),
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      const interrupt = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped);
      yield* Deferred.await(child.stopping);
      expect(yield* Deferred.isDone(child.released)).toBe(false);
      yield* Deferred.succeed(child.exited, ChildProcessSpawner.ExitCode(130));
      yield* Fiber.join(interrupt);
      expect(yield* Deferred.isDone(child.released)).toBe(true);
      const exit = yield* Fiber.await(fiber);
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }).pipe(Effect.scoped),
);

it.effect(
  "hands an unresponsive child back to platform termination after the grace period",
  () =>
    Effect.gen(function* () {
      const harness = yield* parentHarness;
      const fiber = yield* DevSupervisor.run(Effect.void).pipe(
        Effect.provide(harness.layer),
        Effect.forkScoped,
      );
      const child = yield* Queue.take(harness.started);
      const interrupt = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped);
      yield* Deferred.await(child.stopping);
      expect(yield* Deferred.isDone(child.released)).toBe(false);
      yield* TestClock.adjust("5 seconds");
      yield* Fiber.join(interrupt);
      expect(yield* Deferred.isDone(child.released)).toBe(true);
    }).pipe(Effect.scoped),
);

const childHarness = Effect.gen(function* () {
  const disconnected = yield* Deferred.make<
    void,
    PlatformError.PlatformError
  >();
  const events = yield* Queue.unbounded<string>();
  const layer = Layer.mergeAll(
    childConfig,
    Stdio.layerTest({
      stdin: Stream.fromEffect(Deferred.await(disconnected)).pipe(Stream.drain),
    }),
    Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {}),
  );
  return { disconnected, events, layer };
});

it.effect("keeps worker IPC intact when the fake child disconnects", () =>
  Effect.gen(function* () {
    const worker = globalThis.process;
    const connected = worker.connected;
    const send = worker.send?.bind(worker);
    const descriptors = ["send", "connected", "disconnect"].map(
      (name) => [name, Object.getOwnPropertyDescriptor(worker, name)] as const,
    );
    const listeners = worker.listeners("disconnect");
    const harness = yield* childHarness;
    const started = yield* Deferred.make<void>();
    const fiber = yield* DevSupervisor.run(
      Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
    ).pipe(Effect.provide(harness.layer), Effect.forkScoped);
    yield* Deferred.await(started);
    yield* Deferred.succeed(harness.disconnected, undefined);
    const exit = yield* Fiber.await(fiber);
    assert(Exit.isFailure(exit));
    expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    expect(worker.connected).toBe(connected);
    expect(worker.listeners("disconnect")).toEqual(listeners);
    for (const [name, descriptor] of descriptors) {
      expect(Object.getOwnPropertyDescriptor(worker, name)).toEqual(descriptor);
    }
    if (send)
      yield* Effect.callback<void>((resume) => {
        send({ cmd: "NODE_CONFECT_TEST" }, (error) =>
          resume(error ? Effect.die(error) : Effect.void),
        );
      });
  }).pipe(Effect.scoped),
);

it.effect("requests a restart exit only after successful session cleanup", () =>
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
      Effect.provide(harness.layer),
      Effect.forkScoped,
    );
    expect(yield* Queue.take(harness.events)).toBe("cleanup");
    expect(fiber.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(allowCleanup, undefined);
    const exit = yield* Fiber.await(fiber);
    assert(Exit.isFailure(exit));
    expect(exit.cause.reasons).toHaveLength(1);
    expect(Cause.findError(exit.cause)).toEqual(
      Result.succeed(new DevSupervisor.SessionRestart()),
    );
    const codes: Array<number> = [];
    Runtime.defaultTeardown(exit, (code) => codes.push(code));
    expect(codes).toEqual([75]);
    expect(Runtime.getErrorReported(new DevSupervisor.SessionRestart())).toBe(
      false,
    );
  }).pipe(Effect.scoped),
);

it.effect.each(["complete", "fail", "defect"] as const)(
  "does not restart on %s",
  (mode) =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const failure = new DevSupervisor.SessionExited({ code: 7 });
      const session =
        mode === "complete"
          ? Effect.void
          : mode === "fail"
            ? Effect.fail(failure)
            : Effect.die(failure);
      const exit = yield* DevSupervisor.run(session).pipe(
        Effect.provide(harness.layer),
        Effect.exit,
      );
      if (mode === "complete") expect(exit).toEqual(Exit.void);
      else {
        assert(Exit.isFailure(exit));
        expect(exit.cause.reasons).toHaveLength(1);
        expect(
          mode === "fail"
            ? Cause.findError(exit.cause)
            : Cause.findDefect(exit.cause),
        ).toEqual(Result.succeed(failure));
      }
      const codes: Array<number> = [];
      Runtime.defaultTeardown(exit, (code) => codes.push(code));
      expect(codes).toEqual([mode === "complete" ? 0 : 1]);
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
      Effect.provide(harness.layer),
      Effect.exit,
    );
    assert(Exit.isFailure(exit));
    expect(Cause.hasDies(exit.cause)).toBe(true);
    expect(Cause.hasFails(exit.cause)).toBe(true);
    const codes: Array<number> = [];
    Runtime.defaultTeardown(exit, (code) => codes.push(code));
    expect(codes).toEqual([1]);
  }),
);

it.effect.each(["interrupt", "disconnect"] as const)(
  "cleans up the child session on %s",
  (reason) =>
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
        Effect.provide(harness.layer),
        Effect.forkScoped,
      );
      expect(yield* Queue.take(harness.events)).toBe("start");
      if (reason === "interrupt") yield* Fiber.interrupt(fiber);
      else yield* Deferred.succeed(harness.disconnected, undefined);
      const exit = yield* Fiber.await(fiber);
      assert(Exit.isFailure(exit));
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(yield* Queue.take(harness.events)).toBe("cleanup");
    }).pipe(Effect.scoped),
);

it.effect("preserves interruption during restart cleanup", () =>
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
      Effect.provide(harness.layer),
      Effect.forkScoped,
    );
    yield* Queue.take(harness.events);
    const interrupted = yield* Fiber.interrupt(fiber).pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    yield* Deferred.succeed(allowCleanup, undefined);
    yield* Fiber.join(interrupted);
    const exit = yield* Fiber.await(fiber);
    assert(Exit.isFailure(exit));
    expect(Cause.hasInterrupts(exit.cause)).toBe(true);
    const codes: Array<number> = [];
    Runtime.defaultTeardown(exit, (code) => codes.push(code));
    expect(codes).not.toContain(75);
  }).pipe(Effect.scoped),
);

it.effect(
  "propagates a shutdown-pipe failure and cleans up without restarting",
  () =>
    Effect.gen(function* () {
      const harness = yield* childHarness;
      const failure = PlatformError.systemError({
        _tag: "Unknown",
        module: "Stdio",
        method: "stdin",
        cause: "read failed",
      });
      const session = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Queue.offer(harness.events, "cleanup"),
        );
        yield* Queue.offer(harness.events, "start");
        return yield* Effect.never;
      });
      const fiber = yield* DevSupervisor.run(session).pipe(
        Effect.provide(harness.layer),
        Effect.result,
        Effect.forkScoped,
      );
      yield* Queue.take(harness.events);
      yield* Deferred.fail(harness.disconnected, failure);
      expect(yield* Fiber.join(fiber)).toEqual(Result.fail(failure));
      expect(yield* Queue.take(harness.events)).toBe("cleanup");
    }).pipe(Effect.scoped),
);
