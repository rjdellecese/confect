import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as Command from "effect/cli/Command";
import * as Deferred from "effect/Deferred";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as esbuild from "esbuild";
import { dev } from "@confect/cli/confect/dev";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as Project from "./integration/Project";

vi.mock("esbuild", (importOriginal) =>
  importOriginal<typeof esbuild>().then((original) => ({
    ...original,
    context: vi.fn(original.context),
  })),
);

vi.mock("effect/Console", (importOriginal) =>
  importOriginal<typeof Console>().then((original) => ({
    ...original,
    log: vi.fn(original.log),
    error: vi.fn(original.error),
  })),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "dev dependency watcher resources",
  (it) => {
    it.effect.each(["operation", "metadata"] as const)(
      "does not report readiness after a watcher %s failure and recovers on edit",
      (failureKind) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const failure = yield* Deferred.make<void>();
          const ready = yield* Deferred.make<void>();
          let broken = true;
          let readyCount = 0;
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Console, "log").mockImplementation((...args) =>
                Effect.sync(() => {
                  if (
                    args.some(
                      (arg) =>
                        typeof arg === "string" &&
                        arg.includes("Generated files are up-to-date"),
                    )
                  ) {
                    readyCount++;
                    Deferred.doneUnsafe(ready, Effect.void);
                  }
                }),
              ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Console, "error").mockImplementation((...args) =>
                Effect.sync(() => {
                  const message =
                    failureKind === "operation"
                      ? "watcher service unavailable"
                      : "esbuild completed without metafile";
                  if (
                    args.some(
                      (arg) => typeof arg === "string" && arg.includes(message),
                    )
                  )
                    Deferred.doneUnsafe(failure, Effect.void);
                }),
              ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          const context = vi.mocked(esbuild.context);
          const original = context.getMockImplementation();
          assert(original);
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          context.mockImplementation((options) =>
            runPromise(
              Effect.gen(function* () {
                const actual = yield* Effect.tryPromise(() =>
                  original({
                    ...options,
                    plugins: [
                      {
                        name: "inject-watcher-failure",
                        setup(build) {
                          build.onEnd((built) => {
                            if (broken && failureKind === "metadata")
                              built.metafile = undefined;
                          });
                        },
                      },
                      ...(options.plugins ?? []),
                    ],
                  }),
                );
                return {
                  ...actual,
                  rebuild: () =>
                    broken && failureKind === "operation"
                      ? Promise.reject(new Error("watcher service unavailable"))
                      : actual.rebuild(),
                };
              }),
            ),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => context.mockImplementation(original)),
          );
          yield* Command.runWith(dev, { version: "test" })([]).pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
            Effect.forkScoped,
          );
          yield* Deferred.await(failure).pipe(Effect.timeout("15 seconds"));
          expect(readyCount).toBe(0);
          broken = false;
          yield* project.write(
            "confect/notes.spec.ts",
            `${Project.spec}\n// recovered watcher\n`,
          );
          yield* Deferred.await(ready).pipe(Effect.timeout("15 seconds"));
          expect(readyCount).toBe(1);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each(["confect/name.ts", "name.ts"])(
      "reconciles a startup edit to %s before reporting readiness",
      (dependency) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const importPath = dependency.startsWith("confect/")
            ? "./name"
            : "../name";
          yield* project.write(dependency, 'export const name = "first";\n');
          yield* project.write(
            "confect/notes.spec.ts",
            `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { name } from "${importPath}";
export default GroupSpec.make().addFunction(FunctionSpec.publicQuery({ name, returns: () => Schema.Null }));
`,
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import spec from "./notes.spec";
import { name } from "${importPath}";
export default GroupImpl.make(databaseSchema, spec).pipe(Layer.provide(FunctionImpl.make(databaseSchema, spec, name, () => Effect.succeed(null))), GroupImpl.finalize);
`,
          );
          const ready = yield* Deferred.make<void>();
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Console, "log").mockImplementation((...args) =>
                Effect.sync(() => {
                  if (
                    args.some(
                      (arg) =>
                        typeof arg === "string" &&
                        arg.includes("Generated files are up-to-date"),
                    )
                  ) {
                    Deferred.doneUnsafe(ready, Effect.void);
                  }
                }),
              ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          const context = vi.mocked(esbuild.context);
          const original = context.getMockImplementation();
          assert(original);
          let edited = false;
          context.mockImplementation((options) =>
            original({
              ...options,
              plugins: [
                ...(options.plugins ?? []),
                {
                  name: "edit-before-first-watch-snapshot",
                  setup(build) {
                    build.onStart(() => {
                      if (edited) return;
                      edited = true;
                      return runPromise(
                        project.write(
                          dependency,
                          'export const name = "second";\n',
                        ),
                      );
                    });
                  },
                },
              ],
            }),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => context.mockImplementation(original)),
          );
          yield* Command.runWith(dev, { version: "test" })([]).pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
            Effect.forkScoped,
          );
          yield* Deferred.await(ready).pipe(Effect.timeout("15 seconds"));
          expect(edited).toBe(true);
          const generated = yield* fs.readFileString(
            path.join(project.root, "convex/notes.ts"),
          );
          expect(generated).toContain("export const second =");
          expect(generated).not.toContain("export const first =");
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each([1, 8])(
      "uses a bounded number of build contexts for %i groups",
      (groups) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const names = [
            "notes",
            ...Array.from({ length: groups - 1 }, (_, i) => `other${i}`),
          ];
          yield* Effect.forEach(names.slice(1), (name) =>
            Effect.all([
              project.write(`confect/${name}.spec.ts`, Project.spec),
              project.write(
                `confect/${name}.impl.ts`,
                Project.impl.replace('"./notes.spec"', `"./${name}.spec"`),
              ),
            ]),
          );
          const unseen = new Set([
            ...names.flatMap((name) => [`${name}.spec.ts`, `${name}.impl.ts`]),
            path.join("tables", "notes.ts"),
          ]);
          const ready = yield* Deferred.make<void>();
          const original = vi.mocked(esbuild.context).getMockImplementation();
          assert(original);
          const context = vi.mocked(esbuild.context);
          context.mockClear();
          context.mockImplementation((options) =>
            original({
              ...options,
              plugins: [
                ...(options.plugins ?? []),
                {
                  name: "observe-watcher-graphs",
                  setup(build) {
                    build.onEnd((result) => {
                      for (const input of Object.keys(
                        result.metafile?.inputs ?? {},
                      )) {
                        unseen.delete(
                          path.relative(
                            path.join(project.root, "confect"),
                            path.resolve(
                              build.initialOptions.absWorkingDir ?? ".",
                              input,
                            ),
                          ),
                        );
                      }
                      if (unseen.size === 0)
                        Deferred.doneUnsafe(ready, Effect.void);
                    });
                  },
                },
              ],
            }),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => context.mockImplementation(original)),
          );
          yield* Command.runWith(dev, { version: "test" })([]).pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
            Effect.forkScoped,
          );
          yield* Deferred.await(ready).pipe(Effect.timeout("15 seconds"));
          expect(context.mock.calls.length).toBeLessThanOrEqual(4);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
