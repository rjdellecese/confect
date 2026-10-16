import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { fork } from "node:child_process";
import type * as ChildProcess from "node:child_process";
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

  it.effect.each([
    { level: "Debug", reason: "CompileFailure" },
    { level: "Info", reason: "CompileFailure" },
    { level: "Debug", reason: "UnattributedWarnings" },
    { level: "Info", reason: "UnattributedWarnings" },
  ] as const)(
    "honors $level logging for $reason inside the child evaluator",
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
        const result = yield* project
          .provide(Evaluation.generateSnapshot)
          .pipe(
            Effect.provideService(References.MinimumLogLevel, level),
            Effect.result,
          );
        yield* Deferred.await(closed).pipe(Effect.timeout("10 seconds"));
        expect(Result.isFailure(result)).toBe(reason === "CompileFailure");
        const text = output.join("");
        if (level === "Debug") {
          expect(text).toContain("falling back to individual builds");
          expect(text).toContain(reason);
          expect(text).toContain("notes.ts");
          if (reason === "CompileFailure") {
            expect(text.match(/Shared build failed/g)).toHaveLength(1);
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

  it.effect(
    "recovers after a user module exits its evaluator",
    () =>
      Effect.gen(function* () {
        const project = yield* setup;
        yield* project.provide(Evaluation.generate);
        yield* project.write(
          "confect/notes.impl.ts",
          `${Project.impl}\nprocess.exit(23);\n`,
        );
        const paths = [ImplModulePath.make("notes.impl.ts")];
        const failed = yield* project
          .provide(Evaluation.validate(paths))
          .pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(failed.failure.diagnostic).toContain("23");
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
