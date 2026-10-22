import * as NodeServices from "@confect/cli/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as Command from "effect/cli/Command";
import * as Clock from "effect/Clock";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as esbuild from "esbuild";
import * as Evaluation from "@confect/cli/Evaluation";
import type * as DevSupervisor from "@confect/cli/DevSupervisor";
import { dev } from "@confect/cli/confect/dev";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as Project from "./integration/Project";

vi.mock("@confect/cli/DevSupervisor", (importOriginal) =>
  importOriginal<typeof DevSupervisor>().then((original) => ({
    ...original,
    run: Effect.scoped,
  })),
);

vi.mock("esbuild", (importOriginal) =>
  importOriginal<typeof esbuild>().then((original) => ({
    ...original,
    context: vi.fn(original.context),
  })),
);

vi.mock("@confect/cli/Evaluation", (importOriginal) =>
  importOriginal<typeof Evaluation>().then((original) => ({
    ...original,
    updateDeclarations: vi.fn(original.updateDeclarations),
  })),
);

vi.mock("effect/Console", (importOriginal) =>
  importOriginal<typeof Console>().then((original) => ({
    ...original,
    log: vi.fn(original.log),
    error: vi.fn(original.error),
  })),
);

const traceWaits = (summary: Effect.Effect<Readonly<Record<string, number>>>) =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const checkpoints: Array<{
      readonly phase: string;
      readonly completed: boolean;
      readonly elapsedMillis: number;
    }> = [];
    yield* Effect.addFinalizer((exit) =>
      Exit.isFailure(exit)
        ? Effect.gen(function* () {
            yield* Console.error("Watcher scenario checkpoints", {
              checkpoints,
              summary: yield* summary,
            });
          })
        : Effect.void,
    );
    return <A, E, R>(phase: string, effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        checkpoints.push({
          phase,
          completed: false,
          elapsedMillis: (yield* Clock.currentTimeMillis) - started,
        });
        const value = yield* effect;
        checkpoints.push({
          phase,
          completed: true,
          elapsedMillis: (yield* Clock.currentTimeMillis) - started,
        });
        return value;
      });
  });

layer(NodeServices.layer, { excludeTestServices: true })(
  "dev dependency watcher resources",
  (it) => {
    it.effect.each(["success", "failure", "interruption"] as const)(
      "reports failed wait checkpoints without changing %s",
      (outcome) =>
        Effect.gen(function* () {
          const messages: Array<ReadonlyArray<unknown>> = [];
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Console, "error").mockImplementation((...args) =>
                Effect.sync(() => {
                  messages.push(args);
                }),
              ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          const result = yield* Effect.gen(function* () {
            const wait = yield* traceWaits(Effect.succeed({ rebuilds: 2 }));
            return yield* wait(
              "controlled wait",
              outcome === "success"
                ? Effect.succeed(42)
                : outcome === "failure"
                  ? Effect.fail("expected failure")
                  : Effect.interrupt,
            );
          }).pipe(Effect.scoped, Effect.exit);
          if (outcome === "success") {
            expect(result).toEqual(Exit.succeed(42));
            expect(messages).toEqual([]);
          } else {
            assert(Exit.isFailure(result));
            if (outcome === "failure")
              expect(result).toEqual(Exit.fail("expected failure"));
            else expect(Cause.hasInterruptsOnly(result.cause)).toBe(true);
            expect(messages).toEqual([
              [
                "Watcher scenario checkpoints",
                {
                  checkpoints: [
                    {
                      phase: "controlled wait",
                      completed: false,
                      elapsedMillis: expect.any(Number),
                    },
                  ],
                  summary: { rebuilds: 2 },
                },
              ],
            ]);
          }
        }).pipe(Effect.scoped),
    );

    it.effect.each(["none", "edit", "preferred"] as const)(
      "plans dependent declarations before a delayed module revision and verifies a late %s change",
      (lateChange) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const spec = path.join(project.root, "confect/notes.spec.ts");
          const impl = path.join(project.root, "confect/notes.impl.ts");
          const table = path.join(project.root, "confect/tables/notes.ts");
          yield* project.write(
            "confect/choice.js",
            'export const name = "list";',
          );
          yield* project.write(
            "confect/notes.spec.ts",
            `import { name } from "./choice";\n${Project.spec.replace('name: "list"', "name")}`,
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `import { name } from "./choice";\n${Project.impl.replace('"list"', "name")}`,
          );
          const ready = yield* Queue.unbounded<void>();
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let readyCount = 0;
          let totalRebuilds = 0;
          const updates: Array<{
            readonly declarations: ReadonlyArray<string>;
            readonly paths: ReadonlyArray<string>;
          }> = [];
          const contexts = new Set<{
            readonly roots: ReadonlyArray<string>;
            readonly native: esbuild.BuildContext;
            rebuilds: number;
          }>();
          const wait = yield* traceWaits(
            Effect.sync(() => ({
              ready: readyCount,
              updates: updates.length,
              rebuilds: totalRebuilds,
            })),
          );
          const nativeContext = vi.mocked(esbuild.context);
          const originalContext = nativeContext.getMockImplementation();
          assert(originalContext);
          nativeContext.mockImplementation((options) =>
            originalContext(options).then((native) => {
              const entries = options.entryPoints ?? [];
              const tracked = {
                roots: Array.isArray(entries)
                  ? entries.map((entry) =>
                      typeof entry === "string" ? entry : entry.in,
                    )
                  : Object.values(entries),
                native,
                rebuilds: 0,
              };
              contexts.add(tracked);
              return {
                ...native,
                watch: () => Promise.resolve(),
                rebuild: () => {
                  tracked.rebuilds++;
                  totalRebuilds++;
                  return native.rebuild();
                },
                dispose: () => {
                  contexts.delete(tracked);
                  return native.dispose();
                },
              };
            }),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() =>
              nativeContext.mockImplementation(originalContext),
            ),
          );
          const update = vi.mocked(Evaluation.updateDeclarations);
          const originalUpdate = update.getMockImplementation();
          assert(originalUpdate);
          update.mockImplementation((snapshot, declarations, paths) =>
            Effect.gen(function* () {
              updates.push({
                declarations: declarations.map((entry) => entry.relativePath),
                paths,
              });
              if (updates.length === 1) {
                yield* Deferred.succeed(started, undefined);
                yield* Deferred.await(release);
              }
              const result = yield* originalUpdate(
                snapshot,
                declarations,
                paths,
              );
              if (updates.length === 1 && lateChange !== "none") {
                expect(readyCount).toBe(1);
                yield* project
                  .write(
                    `confect/choice.${lateChange === "preferred" ? "ts" : "js"}`,
                    'export const name = "latest";',
                  )
                  .pipe(Effect.orDie);
              }
              return result;
            }),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => update.mockImplementation(originalUpdate)),
          );
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Console, "log").mockImplementation((...args) =>
                args.some(
                  (arg) =>
                    typeof arg === "string" &&
                    arg.includes("Generated files are up-to-date"),
                )
                  ? Effect.sync(() => {
                      readyCount++;
                    }).pipe(
                      Effect.andThen(Queue.offer(ready, undefined)),
                      Effect.asVoid,
                    )
                  : Effect.void,
              ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          yield* project
            .provide(Command.runWith(dev, { version: "test" })([]))
            .pipe(Effect.forkScoped);
          yield* wait("initial readiness", Queue.take(ready));
          const tableContext = [...contexts].find((context) =>
            context.roots.includes(table),
          );
          const modules = [...contexts].find(
            (context) =>
              context.roots.includes(spec) && context.roots.includes(impl),
          );
          assert(tableContext && modules);
          expect(tableContext.roots).toEqual([table]);
          expect(modules.roots.toSorted()).toEqual([spec, impl].toSorted());
          for (const context of contexts) context.rebuilds = 0;
          totalRebuilds = 0;
          yield* project.write(
            "confect/tables/notes.ts",
            `${Project.table}\n// table edit\n`,
          );
          yield* wait(
            "table revision build",
            Effect.promise(() => tableContext.native.rebuild()),
          );
          yield* wait("first update start", Deferred.await(started));
          expect(readyCount).toBe(1);
          yield* wait(
            "module revision build",
            Effect.promise(() => modules.native.rebuild()),
          );
          yield* Deferred.succeed(release, undefined);
          yield* wait("updated readiness", Queue.take(ready));
          expect(readyCount).toBe(2);
          expect(updates).toHaveLength(lateChange === "none" ? 1 : 2);
          expect(updates[0]?.declarations.toSorted()).toEqual(
            ["notes.spec.ts", path.join("tables", "notes.ts")].toSorted(),
          );
          expect(updates[0]?.paths).toEqual(["notes.impl.ts"]);
          if (lateChange === "none") {
            expect(modules.rebuilds).toBe(2);
            expect(tableContext.rebuilds).toBe(1);
          } else {
            expect(
              yield* fs.readFileString(
                path.join(project.root, "convex/notes.ts"),
              ),
            ).toContain("export const latest =");
          }
        }).pipe(Effect.scoped, Effect.timeout("20 seconds")),
      { timeout: 25000 },
    );

    it.effect(
      "discards a generation record dirtied while its temporary write is blocked",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const convex = path.join(project.root, "convex");
          const recordPath = path.join(
            project.root,
            "confect/_generated/.confect-generation.json",
          );
          const config =
            'import { defineApp } from "convex/server"; export default defineApp();\n';
          yield* project.write("convex/convex.config.ts", config);
          const ready = yield* Queue.unbounded<void>();
          const readyCount = yield* Ref.make(0);
          const blocked = yield* Queue.unbounded<Deferred.Deferred<void>>();
          const configEvents = yield* Queue.unbounded<FileSystem.WatchEvent>();
          const delivered = yield* Deferred.make<void>();
          const blockWrites = yield* Ref.make(false);
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi
                .spyOn(Console, "log")
                .mockImplementation((...args) =>
                  args.some(
                    (arg) =>
                      typeof arg === "string" &&
                      arg.includes("Generated files are up-to-date"),
                  )
                    ? Ref.update(readyCount, (count) => count + 1).pipe(
                        Effect.andThen(Queue.offer(ready, undefined)),
                        Effect.asVoid,
                      )
                    : Effect.void,
                ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          yield* project
            .provide(Command.runWith(dev, { version: "test" })([]))
            .pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                watch: (directory, options) =>
                  directory === convex
                    ? Stream.fromQueue(configEvents).pipe(
                        Stream.flatMap((event) =>
                          Stream.make(event).pipe(
                            Stream.concat(
                              Stream.fromEffect(
                                Deferred.succeed(delivered, undefined),
                              ).pipe(Stream.drain),
                            ),
                          ),
                        ),
                      )
                    : fs.watch(directory, options),
                writeFileString: (...args) =>
                  Effect.gen(function* () {
                    yield* fs.writeFileString(...args);
                    if (
                      path
                        .basename(args[0])
                        .startsWith(".confect-generation-") &&
                      (yield* Ref.get(blockWrites))
                    ) {
                      const release = yield* Deferred.make<void>();
                      yield* Queue.offer(blocked, release);
                      yield* Deferred.await(release);
                    }
                  }),
              }),
              Effect.forkScoped,
            );
          yield* Queue.take(ready).pipe(Effect.timeout("15 seconds"));
          const before = yield* fs.readFileString(recordPath);
          yield* Ref.set(blockWrites, true);
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec.replace('name: "list"', 'name: "latest"'),
          );
          yield* project.write(
            "confect/notes.impl.ts",
            Project.impl.replace('"list"', '"latest"'),
          );
          const releaseDirty = yield* Queue.take(blocked).pipe(
            Effect.timeout("15 seconds"),
          );
          expect(yield* fs.readFileString(recordPath)).toBe(before);
          expect(yield* Ref.get(readyCount)).toBe(1);
          yield* project.write("convex/convex.config.ts", `${config}\n`);
          yield* Queue.offer(configEvents, {
            _tag: "Update",
            path: "convex.config.ts",
          });
          yield* Deferred.await(delivered).pipe(Effect.timeout("15 seconds"));
          yield* Deferred.succeed(releaseDirty, undefined);
          const releaseClean = yield* Queue.take(blocked).pipe(
            Effect.timeout("15 seconds"),
          );
          expect(yield* fs.readFileString(recordPath)).toBe(before);
          expect(yield* Ref.get(readyCount)).toBe(1);
          yield* Ref.set(blockWrites, false);
          yield* Deferred.succeed(releaseClean, undefined);
          yield* Queue.take(ready).pipe(Effect.timeout("15 seconds"));
          expect(yield* Ref.get(readyCount)).toBe(2);
          const after = yield* fs.readFileString(recordPath);
          expect(after).not.toBe(before);
          expect(after).toContain('"latest"');
          expect(after).not.toContain('"list"');
          expect(
            (yield* project.generatedFiles)[path.join("convex", "notes.ts")],
          ).toContain("export const latest");
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each([
      { kind: "impl", source: Project.impl },
      { kind: "spec", source: Project.spec },
    ])(
      "uses the observed $kind revision without another consumption build",
      ({ kind, source }) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const ready = yield* Queue.unbounded<void>();
          const rebuilds = yield* Ref.make(0);
          const wait = yield* traceWaits(
            Ref.get(rebuilds).pipe(
              Effect.map((count) => ({ rebuilds: count })),
            ),
          );
          const context = vi.mocked(esbuild.context);
          const original = context.getMockImplementation();
          assert(original);
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          context.mockImplementation((options) =>
            original(options).then((actual) => ({
              ...actual,
              rebuild: () =>
                runPromise(
                  Ref.update(rebuilds, (count) => count + 1).pipe(
                    Effect.andThen(Effect.promise(() => actual.rebuild())),
                  ),
                ),
            })),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => context.mockImplementation(original)),
          );
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi
                .spyOn(Console, "log")
                .mockImplementation((...args) =>
                  args.some(
                    (arg) =>
                      typeof arg === "string" &&
                      arg.includes("Generated files are up-to-date"),
                  )
                    ? Queue.offer(ready, undefined).pipe(Effect.asVoid)
                    : Effect.void,
                ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
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
          yield* wait("initial readiness", Queue.take(ready));
          yield* Ref.set(rebuilds, 0);
          yield* project.write(
            `confect/notes.${kind}.ts`,
            `${source}\n// authored edit\n`,
          );
          yield* wait("edited readiness", Queue.take(ready));
          expect(yield* Ref.get(rebuilds)).toBe(2);
        }).pipe(Effect.scoped, Effect.timeout("20 seconds")),
      { timeout: 25000 },
    );

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
