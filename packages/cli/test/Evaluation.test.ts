import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type * as ChildProcess from "node:child_process";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Equal from "effect/Equal";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as References from "effect/References";
import * as Logger from "effect/Logger";
import * as Schema from "effect/Schema";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as ChildProcessCommand from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as esbuild from "esbuild";
import * as Evaluation from "@confect/cli/Evaluation";
import * as EvaluationSession from "@confect/cli/EvaluationSession";
import * as Bundler from "@confect/cli/Bundler";
import * as Compilation from "@confect/cli/Compilation";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { FunctionPaths } from "@confect/cli/FunctionPaths";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import { TableModulePath } from "@confect/cli/TableModulePath";
import * as Project from "./integration/Project";

vi.mock("node:child_process", (importOriginal) =>
  importOriginal<typeof ChildProcess>().then((original) => ({
    ...original,
    fork: vi.fn(original.fork),
  })),
);

layer(NodeServices.layer, { excludeTestServices: true })("Evaluation", (it) => {
  const setup = Effect.gen(function* () {
    const project = yield* Project.make;
    const path = yield* Path.Path;
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(ProjectRoot, {
          get: Effect.succeed(project.root),
        }),
        Effect.provideService(ConfectDirectory, {
          get: Effect.succeed(path.join(project.root, "confect")),
        }),
        Effect.provideService(ConvexDirectory, {
          get: Effect.succeed(path.join(project.root, "convex")),
        }),
      );
    vi.mocked(fork).mockClear();
    return { ...project, provide };
  });

  const expectWorkersExited = () => {
    const workers = vi.mocked(fork).mock.results;
    expect(workers.length).toBeGreaterThan(0);
    for (const result of workers) {
      assert(result.type === "return");
      expect(
        result.value.exitCode !== null || result.value.signalCode !== null,
      ).toBe(true);
    }
  };

  it.effect.each(["external", "component"] as const)(
    "resolves %s manifest changes in a fresh compiler process",
    (mode) =>
      Effect.gen(function* () {
        const project = yield* setup;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner;
        const dependency = path.join(
          project.root,
          "node_modules",
          "session-dependency",
        );
        yield* fs.makeDirectory(dependency, { recursive: true });
        for (const value of ["one", "two"])
          yield* fs.writeFileString(
            path.join(dependency, `${value}.js`),
            mode === "component"
              ? `import { defineComponent } from "convex/server"; export default defineComponent("${value}");`
              : `export default "${value}";`,
          );
        const manifest = (value: string) =>
          fs.writeFileString(
            path.join(dependency, "package.json"),
            `{ "type": "module", "exports": { "${mode === "component" ? "./convex.config" : "."}": "./${value}.js" } }`,
          );
        yield* manifest("one");
        const entry = path.join(
          project.root,
          mode === "component" ? "convex.config.ts" : "entry.ts",
        );
        yield* fs.writeFileString(
          entry,
          mode === "component"
            ? 'import { defineApp } from "convex/server"; import component from "session-dependency/convex.config"; const app = defineApp(); app.use(component); export default app;'
            : 'export { default } from "session-dependency";',
        );
        const script = path.join(project.root, "CompilerSession.mjs");
        const source = path.join(project.root, "CompilerSession.source.mjs");
        yield* fs.writeFileString(
          source,
          `
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as Stream from "effect/Stream";
import * as Bundler from ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(path.resolve(import.meta.dirname, "../src/Bundler.ts"))};
import * as Compilation from ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(path.resolve(import.meta.dirname, "../src/Compilation.ts"))};
import * as ConvexConfig from ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(path.resolve(import.meta.dirname, "../src/ConvexConfig.ts"))};
Effect.gen(function* () {
  const result = yield* Compilation.runJob(process.argv[4] === "component"
    ? ConvexConfig.discoverInstalledComponents(process.argv[2], "convex.config.ts")
    : Bundler.bundle(process.argv[2]).pipe(Effect.map((loaded) => loaded.module.default)));
  yield* Console.log("ready:" + JSON.stringify(yield* result.exit));
  if (process.argv[3] === "watch") {
    yield* Stream.runHead((yield* Compilation.Service).restarts);
    yield* Console.log("restart");
  }
}).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })), Effect.scoped, Effect.provide(NodeServices.layer), NodeRuntime.runMain);
`,
        );
        yield* Effect.promise(() =>
          esbuild.build({
            entryPoints: [source],
            outfile: script,
            bundle: true,
            packages: "external",
            platform: "node",
            format: "esm",
            logLevel: "silent",
          }),
        );
        const first = yield* spawner.spawn(
          ChildProcessCommand.make(process.execPath, [
            script,
            entry,
            "watch",
            mode,
          ]),
        );
        const lines = yield* Queue.unbounded<string>();
        yield* first.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) => Queue.offer(lines, line)),
          Effect.forkScoped,
        );
        const ready = yield* Queue.take(lines).pipe(
          Effect.repeat({ until: (line) => line.startsWith("ready:") }),
        );
        expect(ready).toContain('"one"');
        yield* manifest("two");
        yield* Queue.take(lines).pipe(
          Effect.repeat({ until: (line) => line === "restart" }),
        );
        expect(yield* first.exitCode).toBe(0);
        const second = yield* spawner.spawn(
          ChildProcessCommand.make(process.execPath, [
            script,
            entry,
            "once",
            mode,
          ]),
        );
        const output = yield* second.stdout.pipe(
          Stream.decodeText(),
          Stream.mkString,
        );
        expect(yield* second.exitCode).toBe(0);
        expect(output).toContain('"two"');
        expect(second.pid).not.toBe(first.pid);
      }).pipe(Effect.scoped, Effect.timeout("20 seconds")),
    { timeout: 25000 },
  );

  it.effect(
    "generates a live snapshot with nested workspace dependency scopes",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const path = yield* Path.Path;
        const job = yield* Compilation.runJob(
          project.provide(Evaluation.generateSnapshot),
        ).pipe(
          Effect.provide(
            Compilation.layer({
              ownedDirectories: [
                path.join(project.root, "confect", "_generated"),
                path.join(project.root, "convex"),
              ],
            }),
          ),
        );
        yield* job.exit;
        expect(job.failedReceipts).toEqual([]);
        expect(job.receipts.flatMap((receipt) => receipt.roots)).toEqual(
          expect.arrayContaining([
            path.join(project.root, "confect", "notes.impl.ts"),
            path.join(project.root, "confect", "notes.spec.ts"),
          ]),
        );
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "records successful and failed worker evaluation consumption",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const path = yield* Path.Path;
        yield* project.write("confect/tables/notes.ts", "export default {};");
        yield* Effect.gen(function* () {
          const validate = project.provide(
            EvaluationSession.validateTables([
              { relativePath: "tables/notes.ts", tableName: "notes" },
            ]).pipe(EvaluationSession.provide),
          );
          const failed = yield* Compilation.runJob(validate);
          expect(Result.isFailure(yield* Effect.result(failed.exit))).toBe(
            true,
          );
          expect(failed.failedReceipts).toEqual([]);
          expect(failed.receipts.flatMap((receipt) => receipt.roots)).toContain(
            path.join(project.root, "confect", "tables", "notes.ts"),
          );
          yield* project.write(
            "confect/tables/notes.ts",
            'import * as Table from "@confect/core/Table"; import * as Schema from "effect/Schema"; export default Table.make(() => Schema.Struct({ text: Schema.String }));',
          );
          const successful = yield* Compilation.runJob(validate);
          yield* successful.exit;
          expect(successful.failedReceipts).toEqual([]);
          expect(
            successful.receipts.flatMap((receipt) => receipt.roots),
          ).toEqual([path.join(project.root, "confect", "tables", "notes.ts")]);
          expectWorkersExited();
        }).pipe(
          Effect.provide(
            Compilation.layer({
              ownedDirectories: [
                path.join(project.root, "confect", "_generated"),
                path.join(project.root, "convex"),
              ],
              authoredFiles: [
                path.join(project.root, "convex", "convex.config.ts"),
                path.join(project.root, "convex", "tsconfig.json"),
              ],
            }),
          ),
        );
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "generates and updates declarations from prepared artifacts with no child compiler",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof ChildProcess>("node:child_process"),
        );
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            vi.mocked(fork).mockImplementation((filename) =>
              original.fork(filename, {
                serialization: "advanced",
                env: {
                  ...process.env,
                  ESBUILD_BINARY_PATH: path.join(project.root, "package.json"),
                },
              }),
            ),
          ),
          () =>
            Effect.sync(() =>
              vi.mocked(fork).mockImplementation(original.fork),
            ),
        );
        const isolated = `\nif (process.pid === ${process.pid}) throw new Error("User module ran in coordinator");\n`;
        yield* project.write(
          "confect/tables/notes.ts",
          Project.table + isolated,
        );
        yield* project.write("confect/notes.spec.ts", Project.spec + isolated);
        yield* project.write("confect/notes.impl.ts", Project.impl + isolated);
        yield* fs.makeDirectory(path.join(project.root, "convex", "waitlist"));
        yield* project.write(
          "convex/waitlist/convex.config.ts",
          'import { defineComponent } from "convex/server";\nexport default defineComponent("waitlist");\n' +
            isolated,
        );
        yield* project.write(
          "convex/convex.config.ts",
          'import { defineApp } from "convex/server";\nimport waitlist from "./waitlist/convex.config";\nconst app = defineApp();\napp.use(waitlist);\nexport default app;\n' +
            isolated,
        );
        for (const file of ["http.ts", "crons.ts", "auth.ts"]) {
          yield* project.write(
            `confect/${file}`,
            'throw new Error("Optional modules must only compile");\nexport default {};\n',
          );
        }
        const snapshot = yield* project.provide(Evaluation.generateSnapshot);
        const first = yield* project.generatedFiles;
        expect(
          first[path.join("confect", "_generated", "components.ts")],
        ).toContain('"waitlist"');
        expectWorkersExited();
        expect(
          Equal.equals(
            yield* project.provide(Evaluation.loadPreviousFunctionPaths),
            GenerationSnapshot.functionPaths(snapshot),
          ),
        ).toBe(true);
        yield* project.write(
          "confect/notes.spec.ts",
          Project.spec.replace('name: "list"', 'name: "latest"') + isolated,
        );
        yield* project.write(
          "confect/notes.impl.ts",
          Project.impl.replace('"list"', '"latest"') + isolated,
        );
        yield* project.write(
          "confect/tables/notes.ts",
          Project.table.replace(
            "text: Schema.String",
            "text: Schema.String, archived: Schema.Boolean",
          ) + isolated,
        );
        const next = yield* project.provide(
          Evaluation.updateDeclarations(
            snapshot,
            [
              {
                _tag: "Spec",
                relativePath: SpecModulePath.make("notes.spec.ts"),
              },
              {
                _tag: "Table",
                relativePath: TableModulePath.make("tables/notes.ts"),
              },
            ],
            [ImplModulePath.make("notes.impl.ts")],
          ),
        );
        expect(
          [...GenerationSnapshot.functionPaths(next)].map((fn) => fn.name),
        ).toEqual(["latest"]);
        const updated = yield* project.generatedFiles;
        expect(
          yield* Project.writtenFiles(
            project.provide(Evaluation.generateSnapshot),
          ),
        ).toEqual([]);
        expect(yield* project.generatedFiles).toEqual(updated);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "keeps batch and individual artifacts through later RPC phases and worker termination",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;
        yield* project.provide(Evaluation.generateSnapshot);
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof ChildProcess>("node:child_process"),
        );
        const artifacts: string[] = [];
        const presentAtExit: boolean[] = [];
        vi.mocked(fork).mockImplementationOnce((...args) => {
          const child = original.fork(...args);
          child.once("exit", () =>
            presentAtExit.push(...artifacts.map(existsSync)),
          );
          return child;
        });
        yield* project.provide(
          Effect.gen(function* () {
            const entry = path.join(
              project.root,
              "confect",
              "_generated",
              "spec.ts",
            );
            const { client, requestContext } =
              yield* EvaluationSession.ModuleEvaluation;
            const batch = yield* Bundler.withBatch(
              [entry],
              Bundler.compile(entry),
            ).pipe(Effect.scoped);
            const individual = yield* Bundler.compile(entry).pipe(
              Effect.scoped,
            );
            artifacts.push(
              fileURLToPath(batch.url),
              fileURLToPath(individual.url),
            );
            for (const artifact of [batch, individual]) {
              expect(yield* fs.exists(fileURLToPath(artifact.url))).toBe(true);
              const previous = yield* client.Previous({
                ...requestContext,
                url: artifact.url,
              });
              expect([...previous].map((fn) => fn.name)).toEqual(["list"]);
            }
          }).pipe(EvaluationSession.provide),
        );
        expect(presentAtExit).toEqual([true, true]);
        for (const artifact of artifacts)
          expect(yield* fs.exists(artifact)).toBe(false);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "validates coordinator-compiled artifacts without a compiler in the evaluator",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const path = yield* Path.Path;
        yield* project.provide(Evaluation.generateSnapshot);
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof ChildProcess>("node:child_process"),
        );
        vi.mocked(fork).mockClear();
        vi.mocked(fork).mockImplementationOnce((filename) =>
          original.fork(filename, {
            serialization: "advanced",
            env: {
              ...process.env,
              ESBUILD_BINARY_PATH: path.join(project.root, "package.json"),
            },
          }),
        );
        yield* project.provide(
          Evaluation.validate([ImplModulePath.make("notes.impl.ts")]),
        );
        expect(vi.mocked(fork)).toHaveBeenCalledTimes(1);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect.each([
    { level: "Debug", reason: "CompileFailure" },
    { level: "Info", reason: "CompileFailure" },
    { level: "Debug", reason: "UnattributedWarnings" },
    { level: "Info", reason: "UnattributedWarnings" },
  ] as const)(
    "honors $level logging for $reason in the compilation coordinator",
    ({ level, reason }) =>
      Effect.gen(function* () {
        const project = yield* setup;
        if (reason === "CompileFailure") {
          yield* project.write("confect/tables/notes.ts", "export default ;");
        } else {
          yield* project.write(
            "tsconfig.json",
            '{"compilerOptions":{"target":"invalid-target"}}',
          );
        }
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof ChildProcess>("node:child_process"),
        );
        const closed = yield* Deferred.make<void>();
        const output: string[] = [];
        const events: Logger.Options<unknown>[] = [];
        vi.mocked(fork).mockImplementationOnce((filename) => {
          const child = original.fork(filename, {
            serialization: "advanced",
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          });
          assert(child.stdout);
          assert(child.stderr);
          child.stdout.on("data", (chunk: Buffer) => {
            output.push(chunk.toString());
          });
          child.stderr.on("data", (chunk: Buffer) => {
            output.push(chunk.toString());
          });
          child.once("close", () => Deferred.doneUnsafe(closed, Effect.void));
          return child;
        });
        const result = yield* project.provide(Evaluation.generateSnapshot).pipe(
          Effect.provideService(References.MinimumLogLevel, level),
          Effect.provide(
            Logger.layer([
              Logger.make((event) => {
                events.push(event);
              }),
            ]),
          ),
          Effect.result,
        );
        yield* Deferred.await(closed).pipe(Effect.timeout("10 seconds"));
        expect(Result.isFailure(result)).toBe(reason === "CompileFailure");
        expect(output.join("")).not.toContain(
          "falling back to individual builds",
        );
        const text = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        )(events.map((event) => event.message));
        if (level === "Debug") {
          expect(text).toContain("falling back to individual builds");
          expect(text).toContain(reason);
          expect(text).toContain("notes.ts");
          if (reason === "CompileFailure") {
            expect(text.match(/Shared build failed/g)).toHaveLength(1);
            expect(
              events.map((event) => Cause.pretty(event.cause)).join("\n"),
            ).toContain("Unexpected");
          }
        } else {
          expect(text).not.toContain("falling back to individual builds");
          expect(text).not.toContain(reason);
        }
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "roundtrips incremental snapshots and disposes failed declaration updates",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const snapshot = yield* project.provide(Evaluation.generateSnapshot);
        yield* project.write(
          "confect/notes.spec.ts",
          Project.spec.replace('name: "list"', 'name: "latest"'),
        );
        yield* project.write(
          "confect/notes.impl.ts",
          Project.impl.replace('"list"', '"latest"'),
        );
        const next = yield* project.provide(
          Evaluation.updateDeclarations(
            snapshot,
            [
              {
                _tag: "Spec",
                relativePath: SpecModulePath.make("notes.spec.ts"),
              },
            ],
            [],
          ),
        );
        expect(Schema.is(GenerationSnapshot.GenerationSnapshot)(next)).toBe(
          true,
        );
        expect(
          [...GenerationSnapshot.functionPaths(next)].map((fn) => fn.name),
        ).toEqual(["latest"]);
        expectWorkersExited();
        yield* project.write("confect/notes.spec.ts", "export default {};\n");
        const failed = yield* project
          .provide(
            Evaluation.updateDeclarations(
              next,
              [
                {
                  _tag: "Spec",
                  relativePath: SpecModulePath.make("notes.spec.ts"),
                },
              ],
              [],
            ),
          )
          .pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(failed.failure.diagnostic).toContain("GroupSpec");
        expectWorkersExited();
        yield* project.write("confect/notes.spec.ts", Project.spec);
        yield* project.write("confect/notes.impl.ts", Project.impl);
        const repaired = yield* project.provide(
          Evaluation.updateDeclarations(
            next,
            [
              {
                _tag: "Spec",
                relativePath: SpecModulePath.make("notes.spec.ts"),
              },
            ],
            [],
          ),
        );
        expect(
          [...GenerationSnapshot.functionPaths(repaired)].map((fn) => fn.name),
        ).toEqual(["list"]);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "does not start an evaluator when no previous generated spec exists",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const previous = yield* project.provide(
          Evaluation.loadPreviousFunctionPaths,
        );
        expect(HashSet.size(previous)).toBe(0);
        expect(vi.mocked(fork)).not.toHaveBeenCalled();
      }).pipe(Effect.scoped),
  );

  it.effect(
    "returns branded metadata without retaining an evaluation worker",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const first = yield* project.provide(Evaluation.generate);
        expect(Schema.is(FunctionPaths)(first)).toBe(true);
        expect(HashSet.size(first)).toBe(1);
        expectWorkersExited();
        const previous = yield* project.provide(
          Evaluation.loadPreviousFunctionPaths,
        );
        expect(Equal.equals(previous, first)).toBe(true);
        expectWorkersExited();
        const second = yield* project.provide(Evaluation.generate);
        expect(Equal.equals(second, first)).toBe(true);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "ignores unbuildable previous specs but reports invalid exports and worker exits",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generateSnapshot);
        yield* project.write(
          "confect/_generated/spec.ts",
          'import "./missing";\nexport default {};\n',
        );
        expect(
          HashSet.size(
            yield* project.provide(Evaluation.loadPreviousFunctionPaths),
          ),
        ).toBe(0);
        for (const source of ["export default {};", "process.exit(23);"]) {
          yield* project.write("confect/_generated/spec.ts", source);
          const failed = yield* project
            .provide(Evaluation.loadPreviousFunctionPaths)
            .pipe(Effect.result);
          assert(Result.isFailure(failed));
          expect(failed.failure.diagnostic).toContain(
            source.startsWith("process") ? "23" : "valid Spec",
          );
          expectWorkersExited();
        }
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "isolates successive imports and disposes failed evaluations",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generate);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}
globalThis.__confectEvaluationCount = (globalThis.__confectEvaluationCount ?? 0) + 1;
if (globalThis.__confectEvaluationCount !== 1) throw new Error("Evaluation leaked between passes");
`,
        );
        const paths = [ImplModulePath.make("notes.impl.ts")];
        yield* project.provide(Evaluation.validate(paths));
        expectWorkersExited();
        yield* project.provide(Evaluation.validate(paths));
        expectWorkersExited();
        yield* project.write("confect/notes.impl.ts", Project.emptyImpl);
        const failed = yield* project
          .provide(Evaluation.validate(paths))
          .pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(failed.failure.diagnostic).toContain(
          "does not implement every function",
        );
        expectWorkersExited();
        yield* project.write("confect/notes.impl.ts", Project.impl);
        yield* project.provide(Evaluation.validate(paths));
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect.each(["validate", "generate", "update"] as const)(
    "recovers after a user module exits its evaluator during %s",
    (operation) =>
      Effect.gen(function* () {
        const project = yield* setup;
        const snapshot = yield* project.provide(Evaluation.generateSnapshot);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}\nprocess.exit(23);\n`,
        );
        const paths = [ImplModulePath.make("notes.impl.ts")];
        const run =
          operation === "validate"
            ? Evaluation.validate(paths).pipe(Effect.asVoid)
            : operation === "generate"
              ? Evaluation.generateSnapshot.pipe(Effect.asVoid)
              : Evaluation.updateDeclarations(
                  snapshot,
                  [
                    {
                      _tag: "Spec",
                      relativePath: SpecModulePath.make("notes.spec.ts"),
                    },
                  ],
                  paths,
                ).pipe(Effect.asVoid);
        const failed = yield* project.provide(run).pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(failed.failure.diagnostic).toContain("23");
        expectWorkersExited();
        yield* project.write("confect/notes.impl.ts", Project.impl);
        yield* project.provide(run);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "terminates a worker when its request is interrupted",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        const started = yield* Deferred.make<void>();
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof ChildProcess>("node:child_process"),
        );
        vi.mocked(fork).mockImplementationOnce((...args) => {
          const child = original.fork(...args);
          Deferred.doneUnsafe(started, Effect.void);
          return child;
        });
        const fiber = yield* project
          .provide(Evaluation.generate)
          .pipe(Effect.forkScoped);
        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 15000 },
  );

  it.effect.each(["validate", "generate", "update"] as const)(
    "terminates an evaluator stuck in synchronous user code during %s",
    (operation) =>
      Effect.gen(function* () {
        const project = yield* setup;
        const snapshot = yield* project.provide(Evaluation.generateSnapshot);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}\nprocess.stdout.write("EVALUATION_BLOCKED");\nwhile (true) {}\n`,
        );
        const blocked = yield* Deferred.make<void>();
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof ChildProcess>("node:child_process"),
        );
        vi.mocked(fork).mockImplementationOnce((filename) => {
          const child = original.fork(filename, {
            serialization: "advanced",
            stdio: ["ignore", "pipe", "inherit", "ipc"],
          });
          assert(child.stdout);
          child.stdout.on("data", (data: Buffer) => {
            if (data.toString().includes("EVALUATION_BLOCKED")) {
              Deferred.doneUnsafe(blocked, Effect.void);
            }
          });
          return child;
        });
        const paths = [ImplModulePath.make("notes.impl.ts")];
        const run =
          operation === "validate"
            ? Evaluation.validate(paths).pipe(Effect.asVoid)
            : operation === "generate"
              ? Evaluation.generateSnapshot.pipe(Effect.asVoid)
              : Evaluation.updateDeclarations(
                  snapshot,
                  [
                    {
                      _tag: "Spec",
                      relativePath: SpecModulePath.make("notes.spec.ts"),
                    },
                  ],
                  paths,
                ).pipe(Effect.asVoid);
        const fiber = yield* project.provide(run).pipe(Effect.forkScoped);
        yield* Deferred.await(blocked).pipe(Effect.timeout("10 seconds"));
        yield* Fiber.interrupt(fiber).pipe(Effect.timeout("10 seconds"));
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );
});
