import { fork } from "node:child_process";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeStream from "@effect/platform-node/NodeStream";
import { assert, expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

const SessionEvent = Schema.fromJsonString(
  Schema.Struct({
    phase: Schema.Literals(["Start", "Cleanup"]),
    pid: Schema.Int,
  }),
);

class FixtureError extends Schema.TaggedError<FixtureError>()(
  "SupervisorFixtureError",
  {
    cause: Schema.Defect(),
  },
) {}

const launcher = (
  supervisorUrl: string,
) => `import * as DevSupervisor from ${JSON.stringify(supervisorUrl)};
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const mode = process.argv[2];
  const journal = process.argv[3];
  const record = (phase) => Effect.gen(function* () {
    const event = JSON.stringify({ phase, pid: process.pid }) + "\\n";
    yield* fs.writeFileString(journal, event, { flag: "a" });
    yield* Effect.sync(() => {
      process.stdout.write(event);
      if (phase === "Start") process.stderr.write("session-stderr:" + process.pid + "\\n");
    });
  });
  const session = Effect.gen(function* () {
    yield* Effect.addFinalizer(() => record("Cleanup").pipe(Effect.orDie));
    yield* record("Start");
    if (mode === "disconnect") return yield* Effect.never;
    if (!(yield* fs.exists(journal + ".restart"))) {
      yield* fs.writeFileString(journal + ".restart", "requested");
      return yield* DevSupervisor.requestRestart;
    }
  });
  const run = DevSupervisor.run(session);
  if (process.env.CONFECT_INTERNAL_DEV_SESSION === "1") return yield* run;
  const disconnected = Effect.callback((resume) => {
    const onDisconnect = () => resume(Effect.interrupt);
    process.once("disconnect", onDisconnect);
    return Effect.sync(() => process.off("disconnect", onDisconnect));
  });
  return yield* run.pipe(Effect.raceFirst(disconnected));
});

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)));
`;

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (Schema.is(Schema.Struct({ code: Schema.Literal("ESRCH") }))(cause))
      return false;
    throw cause;
  }
};

const start = Effect.fn("SupervisorIntegration.start")(function* (
  mode: "restart" | "disconnect",
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({
    directory: import.meta.dirname,
    prefix: "supervisor-",
  });
  const entrypoint = path.join(directory, "launcher.mjs");
  const journal = path.join(directory, "events.jsonl");
  yield* fs.writeFileString(
    entrypoint,
    launcher(
      pathToFileURL(
        path.resolve(import.meta.dirname, "../../src/DevSupervisor.ts"),
      ).href,
    ),
  );
  const terminated = yield* Deferred.make<
    { code: number | null; signal: NodeJS.Signals | null },
    FixtureError
  >();
  const runSync = Effect.runSyncWith(yield* Effect.context());
  const child = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const supervisor = fork(entrypoint, [mode, journal], {
        execArgv: [],
        env: { ...process.env, CONFECT_INTERNAL_DEV_SESSION: "0" },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      supervisor.once("exit", (code, signal) =>
        runSync(Deferred.succeed(terminated, { code, signal })),
      );
      supervisor.once("error", (cause) =>
        runSync(Deferred.fail(terminated, new FixtureError({ cause }))),
      );
      return supervisor;
    }),
    (supervisor) =>
      Effect.gen(function* () {
        if (
          supervisor.exitCode !== null ||
          supervisor.signalCode !== null ||
          supervisor.pid === undefined
        )
          return;
        if (supervisor.connected) supervisor.disconnect();
        supervisor.stdout?.resume();
        supervisor.stderr?.resume();
        const exited = yield* Deferred.await(terminated).pipe(
          Effect.timeoutOption("10 seconds"),
        );
        if (Option.isSome(exited)) return;
        supervisor.kill("SIGKILL");
        yield* Deferred.await(terminated).pipe(Effect.timeout("5 seconds"));
      }).pipe(Effect.orDie),
  );
  const stdout = child.stdout;
  const stderr = child.stderr;
  const pid = child.pid;
  assert(stdout && stderr && pid !== undefined);
  const errors = yield* Ref.make("");
  const errorReader = yield* NodeStream.fromReadable({
    evaluate: () => stderr,
    closeOnDone: false,
  }).pipe(
    Stream.decodeText(),
    Stream.runForEach((text) =>
      Ref.update(errors, (previous) => previous + text),
    ),
    Effect.forkScoped,
  );
  const stdoutEnded = yield* Deferred.make<void>();
  const events = yield* NodeStream.fromReadable({
    evaluate: () => stdout,
    closeOnDone: false,
  }).pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.mapEffect((line) => Schema.decodeEffect(SessionEvent)(line)),
    Stream.ensuring(Deferred.succeed(stdoutEnded, undefined)),
    Stream.toQueue({ capacity: "unbounded" }),
  );
  return {
    child,
    pid,
    errors,
    next: Queue.take(events).pipe(Effect.timeout("10 seconds")),
    exit: Deferred.await(terminated).pipe(
      Effect.tap(() => Fiber.join(errorReader)),
      Effect.tap(() => Deferred.await(stdoutEnded)),
      Effect.timeout("10 seconds"),
    ),
    journal: fs
      .readFileString(journal)
      .pipe(
        Effect.flatMap((contents) =>
          Effect.forEach(contents.trim().split("\n"), (line) =>
            Schema.decodeEffect(SessionEvent)(line),
          ),
        ),
      ),
  };
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "real dev supervisor processes",
  (it) => {
    it.effect(
      "restarts once after cleanup and process exit, then stops on ordinary completion",
      () =>
        Effect.gen(function* () {
          const fixture = yield* start("restart");
          const first = yield* fixture.next;
          expect(first.phase).toBe("Start");
          expect(first.pid).not.toBe(fixture.pid);
          expect(yield* fixture.next).toEqual({
            phase: "Cleanup",
            pid: first.pid,
          });
          const second = yield* fixture.next;
          expect(second.phase).toBe("Start");
          expect(second.pid).not.toBe(first.pid);
          expect(second.pid).not.toBe(fixture.pid);
          expect(isAlive(first.pid)).toBe(false);
          expect(yield* fixture.next).toEqual({
            phase: "Cleanup",
            pid: second.pid,
          });
          expect(yield* fixture.exit).toEqual({ code: 0, signal: null });
          expect(yield* fixture.journal).toEqual([
            first,
            { phase: "Cleanup", pid: first.pid },
            second,
            { phase: "Cleanup", pid: second.pid },
          ]);
          expect(yield* Ref.get(fixture.errors)).toBe(
            `session-stderr:${first.pid}\nsession-stderr:${second.pid}\n`,
          );
          expect(
            Array.map([fixture.pid, first.pid, second.pid], isAlive),
          ).toEqual([false, false, false]);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "disconnects a running child, completes cleanup, and leaves no orphan on interruption",
      () =>
        Effect.gen(function* () {
          const fixture = yield* start("disconnect");
          const session = yield* fixture.next;
          expect(session.phase).toBe("Start");
          expect(isAlive(session.pid)).toBe(true);
          fixture.child.disconnect();
          expect(yield* fixture.next).toEqual({
            phase: "Cleanup",
            pid: session.pid,
          });
          expect(yield* fixture.exit).toEqual({ code: 130, signal: null });
          expect(yield* fixture.journal).toEqual([
            session,
            { phase: "Cleanup", pid: session.pid },
          ]);
          expect(Array.map([fixture.pid, session.pid], isAlive)).toEqual([
            false,
            false,
          ]);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
