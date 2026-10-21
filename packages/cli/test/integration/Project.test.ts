import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as TestClock from "effect/testing/TestClock";
import * as TestConsole from "effect/testing/TestConsole";
import * as Project from "./Project";

const fixture = Effect.gen(function* () {
  const cleanupLogs = yield* Ref.make<ReadonlyArray<unknown>>([]);
  const spawner = ChildProcessSpawner.make(() =>
    Effect.acquireRelease(
      Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(123),
          exitCode: Effect.never,
          isRunning: Effect.succeed(true),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode("fixture stdout\n")),
          stderr: Stream.make(new TextEncoder().encode("fixture stderr\n")),
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      ),
      () =>
        TestConsole.errorLines.pipe(
          Effect.flatMap((logs) => Ref.set(cleanupLogs, logs)),
        ),
    ),
  );
  return { spawner, cleanupLogs };
});

layer(NodeServices.layer)("Project process diagnostics", (it) => {
  it.effect(
    "keeps the readiness deadline and returns a typed failure with output",
    () =>
      Effect.gen(function* () {
        const { spawner, cleanupLogs } = yield* fixture;
        const waiting = yield* Deferred.make<void>();
        const fiber = yield* Effect.gen(function* () {
          const project = yield* Project.make;
          const child = yield* project.start("dev");
          yield* child.waitFor("fixture");
          yield* child.waitFor("fixture");
          yield* Deferred.succeed(waiting, undefined);
          yield* child.waitFor("missing readiness");
        }).pipe(
          Effect.scoped,
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            spawner,
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(waiting);
        yield* TestClock.adjust("14 seconds");
        expect(yield* TestConsole.errorLines).toEqual([]);
        yield* TestClock.adjust("1 second");
        const error = yield* Fiber.join(fiber).pipe(Effect.flip);
        assert(Schema.is(Project.ReadinessTimeout)(error));
        expect(error.command).toBe("dev");
        expect(error.text).toBe("missing readiness");
        expect(error.attempt).toBe(3);
        expect(error.output).toContain("fixture stdout");
        expect(error.output).toContain("fixture stderr");
        const logs = yield* TestConsole.errorLines;
        expect(logs).toHaveLength(1);
        expect(logs[0]).toContain(
          "phase: waiting for output missing readiness (wait 3)",
        );
        expect(logs[0]).toContain("scope failed");
        expect(yield* Ref.get(cleanupLogs)).toEqual(logs);
      }).pipe(Effect.provide(TestConsole.layer, { local: true })),
  );

  it.effect.each(["readiness", "exit"] as const)(
    "reports the active %s phase on interruption before process cleanup",
    (phase) =>
      Effect.gen(function* () {
        const { spawner, cleanupLogs } = yield* fixture;
        const waiting = yield* Deferred.make<void>();
        const fiber = yield* Effect.gen(function* () {
          const project = yield* Project.make;
          const child = yield* project.start("codegen");
          yield* child.waitFor("fixture");
          yield* child.waitFor("fixture");
          yield* Deferred.succeed(waiting, undefined);
          if (phase === "readiness") yield* child.waitFor("next readiness");
          else yield* child.handle.exitCode;
        }).pipe(
          Effect.scoped,
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            spawner,
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(waiting);
        yield* TestClock.adjust(0);
        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        assert(Exit.isFailure(exit));
        expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
        const logs = yield* TestConsole.errorLines;
        expect(logs).toHaveLength(1);
        expect(logs[0]).toContain(
          "confect codegen (pid 123) scope interrupted",
        );
        expect(logs[0]).toContain(
          phase === "readiness" ? "waiting for output" : "waiting for exit",
        );
        if (phase === "readiness") {
          expect(logs[0]).toContain("next readiness (wait 3)");
        }
        expect(logs[0]).toContain("fixture stdout");
        expect(logs[0]).toContain("fixture stderr");
        expect(yield* Ref.get(cleanupLogs)).toEqual(logs);
      }).pipe(Effect.provide(TestConsole.layer, { local: true })),
  );

  it.effect("does not report successful scope cleanup", () =>
    Effect.gen(function* () {
      const { spawner, cleanupLogs } = yield* fixture;
      yield* Effect.gen(function* () {
        const project = yield* Project.make;
        const child = yield* project.start("dev");
        yield* child.waitFor("fixture");
        yield* child.waitFor("fixture");
      }).pipe(
        Effect.scoped,
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      expect(yield* TestConsole.errorLines).toEqual([]);
      expect(yield* Ref.get(cleanupLogs)).toEqual([]);
    }).pipe(Effect.provide(TestConsole.layer, { local: true })),
  );
});
