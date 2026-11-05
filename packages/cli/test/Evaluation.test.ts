import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import * as Arr from "effect/Array";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { Worker } from "node:worker_threads";
import type * as WorkerThreads from "node:worker_threads";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Equal from "effect/Equal";
import * as Fiber from "effect/Fiber";
import * as HashSet from "effect/HashSet";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import * as Evaluation from "@confect/cli/Evaluation";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { FunctionPaths } from "@confect/cli/FunctionPaths";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import * as Project from "./integration/Project";

vi.mock("node:worker_threads", (importOriginal) =>
  importOriginal<typeof WorkerThreads>().then((original) => ({
    ...original,
    Worker: vi.fn(function (
      filename: string | URL,
      options?: WorkerThreads.WorkerOptions,
    ) {
      return new original.Worker(filename, options);
    }),
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
    vi.mocked(Worker).mockClear();
    return { ...project, provide };
  });

  const expectWorkersExited = () => {
    const workers = vi.mocked(Worker).mock.results;
    expect(workers.length).toBeGreaterThan(0);
    for (const result of workers) {
      assert(result.type === "return");
      expect(result.value.threadId).toBe(-1);
    }
  };

  it.effect.each([
    { level: "Debug", reason: "CompileFailure" },
    { level: "Info", reason: "CompileFailure" },
    { level: "Debug", reason: "UnattributedWarnings" },
    { level: "Info", reason: "UnattributedWarnings" },
  ] as const)(
    "honors $level logging for $reason inside the worker evaluator",
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
          vi.importActual<typeof WorkerThreads>("node:worker_threads"),
        );
        const closed = yield* Deferred.make<void>();
        const output: string[] = [];
        vi.mocked(Worker).mockImplementationOnce(function (filename, options) {
          const child = new original.Worker(filename, {
            ...options,
            stdout: true,
            stderr: true,
          });
          assert(child.stdout);
          assert(child.stderr);
          child.stdout.on("data", (chunk: Buffer) => {
            output.push(chunk.toString());
          });
          child.stderr.on("data", (chunk: Buffer) => {
            output.push(chunk.toString());
          });
          child.once("exit", () => Deferred.doneUnsafe(closed, Effect.void));
          return child;
        });
        const result = yield* project
          .provide(Evaluation.generateSnapshot)
          .pipe(
            Effect.provideService(References.MinimumLogLevel, level),
            Effect.result,
          );
        yield* Deferred.await(closed).pipe(Effect.timeout("10 seconds"));
        expect(Result.isFailure(result)).toBe(reason === "CompileFailure");
        const text = Arr.join(output, "");
        if (level === "Debug") {
          expect(text).toContain("falling back to individual builds");
          expect(text).toContain(reason);
          expect(text).toContain("notes.ts");
          if (reason === "CompileFailure") {
            expect(
              Option.getOrNull(pipe(text, Str.match(/Shared build failed/g))),
            ).toHaveLength(1);
            expect(text).toContain("Unexpected");
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
          pipe(Project.spec, Str.replace('name: "list"', 'name: "latest"')),
        );
        yield* project.write(
          "confect/notes.impl.ts",
          pipe(Project.impl, Str.replace('"list"', '"latest"')),
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
          Arr.map([...GenerationSnapshot.functionPaths(next)], (fn) => fn.name),
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
        assert(failed._tag === "Failure");
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
          Arr.map(
            [...GenerationSnapshot.functionPaths(repaired)],
            (fn) => fn.name,
          ),
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
        expect(vi.mocked(Worker)).not.toHaveBeenCalled();
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
        assert(failed._tag === "Failure");
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

  it.effect.each([0, 23])(
    "recovers after a user module exits its evaluator with code %s",
    (code) =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generate);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}\nprocess.exit(${code});\n`,
        );
        const paths = [ImplModulePath.make("notes.impl.ts")];
        const failed = yield* project
          .provide(Evaluation.validate(paths))
          .pipe(Effect.result);
        assert(failed._tag === "Failure");
        expect(failed.failure.diagnostic).toContain(`code: ${code}`);
        expectWorkersExited();
        yield* project.write("confect/notes.impl.ts", Project.impl);
        yield* project.provide(Evaluation.validate(paths));
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "inherits Node flags and forwards user output without mixing it into RPC",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generate);
        const flags = yield* Schema.String.pipe(
          Schema.Array,
          Schema.fromJsonString,
          Schema.encodeEffect,
        )(process.execArgv);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}
if (JSON.stringify(process.execArgv) !== JSON.stringify(${flags})) {
  throw new Error("Evaluator lost inherited Node flags");
}
console.log("EVALUATION_STDOUT");
console.error("EVALUATION_STDERR");
`,
        );
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof WorkerThreads>("node:worker_threads"),
        );
        const stdout: string[] = [];
        const stderr: string[] = [];
        vi.mocked(Worker).mockImplementationOnce(function (...args) {
          const worker = new original.Worker(...args);
          worker.stdout.on("data", (chunk: Buffer) => {
            stdout.push(chunk.toString());
          });
          worker.stderr.on("data", (chunk: Buffer) => {
            stderr.push(chunk.toString());
          });
          return worker;
        });
        yield* project.provide(
          Evaluation.validate([ImplModulePath.make("notes.impl.ts")]),
        );
        expect(Arr.join(stdout, "")).toContain("EVALUATION_STDOUT");
        expect(Arr.join(stderr, "")).toContain("EVALUATION_STDERR");
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "recovers after an uncaught asynchronous error terminates an evaluator",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generate);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}
queueMicrotask(() => { throw new Error("Uncaught evaluator failure"); });
await new Promise(() => {});
`,
        );
        const paths = [ImplModulePath.make("notes.impl.ts")];
        const failed = yield* project
          .provide(Evaluation.validate(paths))
          .pipe(Effect.result);
        assert(failed._tag === "Failure");
        expect(failed.failure.diagnostic).toContain(
          "An error event was emitted",
        );
        expect(failed.failure.diagnostic).toContain(
          "Uncaught evaluator failure",
        );
        expectWorkersExited();
        yield* project.write("confect/notes.impl.ts", Project.impl);
        yield* project.provide(Evaluation.validate(paths));
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
          vi.importActual<typeof WorkerThreads>("node:worker_threads"),
        );
        vi.mocked(Worker).mockImplementationOnce(function (...args) {
          const child = new original.Worker(...args);
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

  it.effect(
    "terminates an evaluator stuck in synchronous user code",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generate);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}\nprocess.stdout.write("EVALUATION_BLOCKED");\nwhile (true) {}\n`,
        );
        const blocked = yield* Deferred.make<void>();
        const original = yield* Effect.promise(() =>
          vi.importActual<typeof WorkerThreads>("node:worker_threads"),
        );
        vi.mocked(Worker).mockImplementationOnce(function (filename, options) {
          const child = new original.Worker(filename, {
            ...options,
            stdout: true,
          });
          assert(child.stdout);
          child.stdout.on("data", (data: Buffer) => {
            if (pipe(data.toString(), Str.includes("EVALUATION_BLOCKED"))) {
              Deferred.doneUnsafe(blocked, Effect.void);
            }
          });
          return child;
        });
        const fiber = yield* project
          .provide(Evaluation.validate([ImplModulePath.make("notes.impl.ts")]))
          .pipe(Effect.forkScoped);
        yield* Deferred.await(blocked).pipe(Effect.timeout("10 seconds"));
        yield* Fiber.interrupt(fiber).pipe(Effect.timeout("10 seconds"));
        expectWorkersExited();
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );
});
