import * as NodeServices from "@effect/platform-node/NodeServices";
import * as GenerationRecord from "@confect/cli/GenerationRecord";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import { assert, expect, layer } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
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

layer(NodeServices.layer, { excludeTestServices: true })(
  "built confect codegen generation records",
  (it) => {
    it.effect.each(["codegen", "dev"] as const)(
      "persists history for configured sibling function roots in %s",
      (command) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const backend = yield* fs.makeTempDirectoryScoped({
            directory: path.dirname(project.root),
            prefix: "backend-",
          });
          yield* fs.writeFileString(
            path.join(backend, "package.json"),
            '{"type":"module"}',
          );
          for (const directory of ["confect", "convex"])
            yield* fs.rename(
              path.join(project.root, directory),
              path.join(backend, directory),
            );
          yield* project.write(
            "convex.json",
            yield* Schema.encodeEffect(
              Schema.fromJsonString(
                Schema.Struct({ functions: Schema.String }),
              ),
            )({
              functions: path.relative(
                project.root,
                path.join(backend, "convex"),
              ),
            }),
          );
          const running = yield* project.start(command);
          yield* running.waitFor("Generated files are up-to-date");
          if (command === "codegen")
            expect(Number(yield* running.handle.exitCode)).toBe(0);
          const history = GenerationRecord.parse(
            yield* fs.readFileString(
              path.join(backend, "confect/_generated/.confect-generation.json"),
            ),
          );
          assert(history._tag === "Loaded");
          expect(
            [...GenerationSnapshot.functionPaths(history.record.snapshot)].map(
              ({ name }) => name,
            ),
          ).toEqual(["list"]);
          expect(
            yield* fs.readFileString(path.join(backend, "convex/notes.ts")),
          ).toContain("export const list");
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "persists identical records for fresh projects and repeated generation",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const first = yield* Project.make;
          const second = yield* Project.make;
          const records: Array<string> = [];
          for (const project of [first, second, first]) {
            const once = yield* project.start("codegen");
            yield* once.waitFor("Generated files are up-to-date");
            expect(Number(yield* once.handle.exitCode)).toBe(0);
            const record = yield* fs.readFileString(
              path.join(
                project.root,
                "confect/_generated/.confect-generation.json",
              ),
            );
            expect(
              yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
                record,
              ),
            ).toEqual({
              version: 1,
              snapshot: [
                [
                  "notes.spec.ts",
                  {
                    runtime: "Convex",
                    functions: [{ name: "list", provenance: "Confect" }],
                    groups: {},
                  },
                ],
              ],
            });
            records.push(record);
          }
          expect(records[1]).toBe(records[0]);
          expect(records[2]).toBe(records[0]);
          expect(yield* second.generatedFiles).toEqual(
            yield* first.generatedFiles,
          );
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each([
      { failure: "missing implementation", error: "has no sibling impl" },
      {
        failure: "invalid implementation",
        error: "does not implement every function",
      },
      { failure: "invalid table", error: "must default-export a Table" },
    ])(
      "retains the successful record after $failure",
      ({ failure, error }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const recordPath = path.join(
            project.root,
            "confect/_generated/.confect-generation.json",
          );
          const initial = yield* project.start("codegen");
          yield* initial.waitFor("Generated files are up-to-date");
          expect(Number(yield* initial.handle.exitCode)).toBe(0);
          const before = yield* fs.readFileString(recordPath);
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec.replace('name: "list"', 'name: "latest"'),
          );
          if (failure === "missing implementation") {
            yield* fs.remove(path.join(project.root, "confect/notes.impl.ts"));
          } else if (failure === "invalid implementation") {
            yield* project.write("confect/notes.impl.ts", Project.emptyImpl);
          } else {
            yield* project.write(
              "confect/notes.impl.ts",
              Project.impl.replace('"list"', '"latest"'),
            );
            yield* project.write(
              "confect/tables/notes.ts",
              "export default {};\n",
            );
          }
          const failed = yield* project.start("codegen");
          yield* failed.waitFor(error);
          expect(Number(yield* failed.handle.exitCode)).not.toBe(0);
          expect(yield* Ref.get(failed.output)).not.toContain(
            "Generated files are up-to-date",
          );
          expect(yield* fs.readFileString(recordPath)).toBe(before);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);

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
