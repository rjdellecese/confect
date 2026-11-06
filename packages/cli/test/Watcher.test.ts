import { pipe } from "effect/Function";
import * as Str from "effect/String";
import * as Schema from "effect/Schema";
import * as Arr from "effect/Array";
import { assert, expect, it, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as esbuild from "esbuild";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Watcher from "@confect/cli/Watcher";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as SyncState from "@confect/cli/SyncState";
import * as EntryPoint from "@confect/cli/EntryPoint";
import * as WatchBuild from "@confect/cli/WatchBuild";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import * as Clock from "effect/Clock";
import * as TestClock from "effect/testing/TestClock";
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

class RebuildError extends Schema.TaggedError<
  RebuildError,
  { readonly brand: unique symbol }
>()("RebuildError", { cause: Schema.Defect() }) {}

const controlledWatcher = Effect.fnUntraced(function* (
  options: {
    readonly files?: ReadonlyArray<string>;
    readonly contents?: Record.ReadonlyRecord<string, string>;
    readonly plugins?: ReadonlyArray<esbuild.Plugin>;
    readonly afterPlugins?: ReadonlyArray<esbuild.Plugin>;
    readonly rebuild?: (
      context: esbuild.BuildContext,
    ) => Promise<esbuild.BuildResult>;
  } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const project = yield* Project.make;
  if (options.files !== undefined)
    for (const file of ["notes.spec.ts", "notes.impl.ts", "tables/notes.ts"])
      if (!options.files.includes(file))
        yield* fs.remove(path.join(project.root, "confect", file));
  for (const file of options.files ?? [
    "notes.spec.ts",
    "notes.impl.ts",
    "tables/notes.ts",
  ])
    yield* project.write(`confect/${file}`, "export const value = 1;");
  for (const [file, contents] of Record.toEntries(options.contents ?? {}))
    yield* project.write(file, contents);

  const events = yield* Queue.unbounded<FileSystem.WatchEvent>();
  const configEvents = yield* Queue.unbounded<FileSystem.WatchEvent>();
  const contexts = yield* Queue.unbounded<{
    readonly actual: esbuild.BuildContext;
    readonly rebuilds: Ref.Ref<number>;
    readonly disposing: Deferred.Deferred<void>;
    readonly disposed: Deferred.Deferred<void>;
  }>();
  const context = vi.mocked(esbuild.context);
  const original = context.getMockImplementation();
  assert(original);
  const actual2 = yield* Effect.context();
  const runPromise = Effect.runPromiseWith(actual2);
  const actual3 = yield* Effect.context();
  const runSync = Effect.runSyncWith(actual3);
  context.mockImplementation((buildOptions) =>
    runPromise(
      Effect.gen(function* () {
        const actual = yield* Effect.promise(() =>
          original({
            ...buildOptions,
            plugins: [
              ...(options.plugins ?? []),
              ...(buildOptions.plugins ?? []),
              ...(options.afterPlugins ?? []),
            ],
          }),
        );
        const rebuilds = yield* Ref.make(0);
        const disposing = yield* Deferred.make<void>();
        const disposed = yield* Deferred.make<void>();
        return {
          ...actual,
          watch: () =>
            runPromise(
              Queue.offer(contexts, {
                actual,
                rebuilds,
                disposing,
                disposed,
              }).pipe(Effect.asVoid),
            ),
          rebuild: () => {
            runSync(Ref.update(rebuilds, (count) => count + 1));
            return options.rebuild !== undefined
              ? options.rebuild(actual)
              : actual.rebuild();
          },
          dispose: () =>
            runPromise(Deferred.succeed(disposing, undefined))
              .then(() => actual.dispose())
              .then(() =>
                runPromise(
                  Deferred.succeed(disposed, undefined).pipe(Effect.asVoid),
                ),
              ),
        };
      }),
    ),
  );
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => context.mockImplementation(original)),
  );
  const watcher = yield* Watcher.make();
  yield* watcher.run.pipe(
    project.provide,
    Effect.provideService(FileSystem.FileSystem, {
      ...fs,
      watch: (directory) =>
        directory === path.join(project.root, "confect")
          ? Stream.fromQueue(events)
          : directory === path.join(project.root, "convex")
            ? Stream.fromQueue(configEvents)
            : Stream.never,
    }),
    Effect.forkScoped,
  );
  const first = yield* Queue.take(contexts);
  const clock = yield* Clock.Clock;
  const withoutCoalescing: Clock.Clock = {
    currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe(),
    currentTimeMillis: clock.currentTimeMillis,
    currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe(),
    currentTimeNanos: clock.currentTimeNanos,
    monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: clock.monotonicTimeNanos,
    sleep: () => Effect.void,
  };
  return {
    watcher: {
      ...watcher,
      next: watcher.next.pipe(
        Effect.repeat({ until: SyncState.isDirty }),
        Effect.provideService(Clock.Clock, withoutCoalescing),
      ),
    },
    coalescedNext: watcher.next,
    project,
    events,
    configEvents,
    contexts,
    first,
  };
});

layer(NodeServices.layer)("entry configuration", (test) => {
  test.effect(
    "rechecks earlier groups after later groups finish building",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const edited = yield* Ref.make(false);
        const earlierOutput = yield* Ref.make("");
        const actual4 = yield* Effect.context();
        const runPromise = Effect.runPromiseWith(actual4);
        const { watcher } = yield* controlledWatcher({
          files: ["notes.spec.ts", "tables/notes.ts"],
          contents: {
            "confect/tsconfig.json": "{}",
            "confect/tables/tsconfig.json": "{}",
            "confect/notes.spec.ts": 'import "../shared";',
            "confect/tables/notes.ts": 'import "../../shared";',
            "shared.ts": 'console.log("before-edit");',
          },
          afterPlugins: [
            {
              name: "edit-after-later-configuration-build",
              setup(build) {
                const table =
                  path.basename(
                    path.dirname(build.initialOptions.tsconfig ?? ""),
                  ) === "tables";
                build.onEnd((result) =>
                  runPromise(
                    Effect.gen(function* () {
                      if (table) {
                        yield* Ref.set(
                          earlierOutput,
                          Arr.join(
                            Arr.map(
                              result.outputFiles ?? [],
                              (output) => output.text,
                            ),
                            "\n",
                          ),
                        );
                      } else if (!(yield* Ref.getAndSet(edited, true))) {
                        yield* fs.writeFileString(
                          path.join(
                            build.initialOptions.absWorkingDir ?? "",
                            "shared.ts",
                          ),
                          'console.log("after-edit");',
                        );
                      }
                    }),
                  ),
                );
              },
            },
          ],
        });
        const actual5 = yield* watcher.refresh;
        expect(Watcher.isRefreshSuccessful(actual5)).toBe(true);
        const current2 = yield* Ref.get(earlierOutput);
        expect(current2).toContain("after-edit");
        const current3 = yield* Ref.get(earlierOutput);
        expect(current3).not.toContain("before-edit");
      }).pipe(Effect.scoped),
  );

  test.effect(
    "keeps other configuration failures visible during recovery",
    () =>
      Effect.gen(function* () {
        const { watcher, project } = yield* controlledWatcher({
          files: ["notes.spec.ts", "tables/notes.ts"],
          contents: {
            "confect/tsconfig.json": "{}",
            "confect/tables/tsconfig.json": "{}",
            "confect/notes.spec.ts": "export const broken = ;",
            "confect/tables/notes.ts": "export const alsoBroken = ;",
          },
        });
        const actual6 = yield* watcher.refresh;
        expect(Watcher.isRefreshSuccessful(actual6)).toBe(false);
        expect((yield* watcher.diagnostics).errors).toHaveLength(2);
        yield* project.write(
          "confect/notes.spec.ts",
          "export const value = 1;",
        );
        const actual7 = yield* watcher.refresh;
        expect(Watcher.isRefreshSuccessful(actual7)).toBe(false);
        expect((yield* watcher.diagnostics).errors).toHaveLength(1);
        yield* project.write(
          "confect/tables/notes.ts",
          "export const value = 2;",
        );
        const actual8 = yield* watcher.refresh;
        expect(Watcher.isRefreshSuccessful(actual8)).toBe(true);
        expect((yield* watcher.diagnostics).errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  test.effect("applies each entry configuration to its shared helpers", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const outputs = yield* Ref.make<ReadonlyArray<string>>([]);
      const actual9 = yield* Effect.context();
      const runSync = Effect.runSyncWith(actual9);
      const { watcher, project } = yield* controlledWatcher({
        files: ["notes.spec.ts", "tables/notes.ts"],
        contents: {
          "confect/tsconfig.json":
            '{"compilerOptions":{"paths":{"alias":["../spec-value.ts"]}}}',
          "confect/tables/tsconfig.json":
            '{"compilerOptions":{"paths":{"alias":["../../table-value.ts"]}}}',
          "confect/notes.spec.ts": 'import "./shared";',
          "confect/tables/notes.ts": 'import "../shared";',
          "confect/shared.ts":
            'import { value } from "alias"; console.log(value);',
          "spec-value.ts": 'export const value = "chosen-spec";',
          "table-value.ts": 'export const value = "chosen-table";',
        },
        afterPlugins: [
          {
            name: "capture-configured-output",
            setup(build) {
              build.onEnd((result) =>
                runSync(
                  Ref.update(outputs, (current) => [
                    ...current,
                    ...Arr.map(result.outputFiles ?? [], (file) => file.text),
                  ]),
                ),
              );
            },
          },
        ],
      });
      const actual10 = yield* watcher.refresh;
      expect(Watcher.isRefreshSuccessful(actual10)).toBe(true);
      expect((yield* watcher.diagnostics).errors).toEqual([]);
      const current4 = yield* Ref.get(outputs);
      expect(Arr.join(current4, "\n")).toContain("chosen-spec");
      const current5 = yield* Ref.get(outputs);
      expect(Arr.join(current5, "\n")).toContain("chosen-table");
      yield* watcher.next;
      yield* project.write("table-value.ts", 'export const value = "changed";');
      const actual11 = yield* watcher.refresh;
      expect(Watcher.isRefreshSuccessful(actual11)).toBe(true);
      const changed = yield* watcher.next;
      expect(SyncState.isDirty(changed)).toBe(true);
      expect(changed.work).toMatchObject({
        _tag: "Declarations",
        entries: [
          { _tag: "Table", relativePath: path.join("tables", "notes.ts") },
        ],
      });
    }).pipe(Effect.scoped),
  );
});

layer(NodeServices.layer)("package self-reference resolution", (test) => {
  test.effect(
    "keeps unchanged strict bundles clean with opposite resolution arrival orders",
    () =>
      Effect.gen(function* () {
        const preferred = yield* Ref.make("./leaf.ts");
        const makeGates = Effect.all({
          waiting: Deferred.make<void>(),
          loaded: Deferred.make<void>(),
        });
        const actual12 = yield* makeGates;
        const gates = yield* Ref.make(actual12);
        const resolutions = yield* Ref.make<ReadonlyArray<string>>([]);
        const outputs = yield* Ref.make<ReadonlyArray<string>>([]);
        const actual13 = yield* Effect.context();
        const runPromise = Effect.runPromiseWith(actual13);
        const actual14 = yield* Effect.context();
        const runSync = Effect.runSyncWith(actual14);
        const { watcher } = yield* controlledWatcher({
          files: ["notes.spec.ts", "notes.impl.ts"],
          contents: {
            "package.json":
              '{"name":"@fixture/backend","type":"module","exports":{"./*":"./confect/*.ts"}}',
            "tsconfig.json": '{"compilerOptions":{"strict":true}}',
            "confect/leaf.ts": "export const value = 1;",
            "confect/notes.spec.ts": 'console.log(require("./leaf.ts"));',
            "confect/notes.impl.ts":
              'console.log(require("@fixture/backend/leaf"));',
          },
          plugins: [
            {
              name: "force-self-reference-arrival-order",
              setup(build) {
                build.onStart(() =>
                  runSync(
                    Effect.flatMap(makeGates, (next) =>
                      Ref.set(gates, next),
                    ).pipe(Effect.asVoid),
                  ),
                );
                build.onResolve({ filter: /leaf(?:\.ts)?$/ }, (args) =>
                  runPromise(
                    Effect.gen(function* () {
                      const { waiting, loaded } = yield* Ref.get(gates);
                      if (args.path === (yield* Ref.get(preferred))) {
                        yield* Deferred.await(waiting);
                      } else {
                        yield* Deferred.succeed(waiting, undefined);
                        yield* Deferred.await(loaded);
                      }
                      yield* Ref.update(resolutions, (events) => [
                        ...events,
                        args.path,
                      ]);
                    }).pipe(Effect.as(undefined)),
                  ),
                );
                build.onLoad({ filter: /[/\\]leaf\.ts$/ }, () =>
                  runSync(
                    Effect.gen(function* () {
                      yield* Ref.update(resolutions, (events) => [
                        ...events,
                        "loaded",
                      ]);
                      const { loaded } = yield* Ref.get(gates);
                      yield* Deferred.succeed(loaded, undefined);
                    }).pipe(Effect.as(undefined)),
                  ),
                );
                build.onEnd((result) =>
                  runSync(
                    Ref.update(outputs, (recorded) => [
                      ...recorded,
                      result.outputFiles?.[0]?.text ?? "",
                    ]).pipe(Effect.asVoid),
                  ),
                );
              },
            },
          ],
        });
        const first = yield* watcher.refresh;
        expect(
          Arr.map((yield* watcher.diagnostics).errors, (error) => error.text),
        ).toEqual([]);
        expect(first).toMatchObject({
          _tag: "Observed",
          outcome: { _tag: "Succeeded" },
        });
        expect((yield* watcher.next).work._tag).toBe("Full");
        yield* Ref.set(preferred, "@fixture/backend/leaf");
        const second = yield* watcher.refresh;
        expect(second).toMatchObject({
          _tag: "Observed",
          outcome: { _tag: "Succeeded" },
        });
        const current6 = yield* Ref.get(resolutions);
        expect(current6).toEqual([
          "./leaf.ts",
          "loaded",
          "@fixture/backend/leaf",
          "@fixture/backend/leaf",
          "loaded",
          "./leaf.ts",
        ]);
        const recorded = yield* Ref.get(outputs);
        expect(recorded).toHaveLength(2);
        expect(recorded[0]).toContain('"use strict"');
        expect(recorded[1]).toBe(recorded[0]);
        const actual15 = yield* watcher.pending;
        expect(actual15).toEqual(SyncState.empty);
      }).pipe(Effect.scoped),
  );
});

it("allows readiness only for empty or successfully refreshed watchers", () => {
  expect(Watcher.isRefreshSuccessful({ _tag: "Empty" })).toBe(true);
  expect(
    Watcher.isRefreshSuccessful({
      _tag: "Observed",
      outcome: WatchBuild.Outcome.Succeeded({
        snapshot: {
          fingerprints: HashMap.empty(),
          graph: HashMap.empty(),
          outputHash: "output",
        },
        warnings: [],
      }),
    }),
  ).toBe(true);
  expect(
    Watcher.isRefreshSuccessful({
      _tag: "Observed",
      outcome: WatchBuild.Outcome.Failed({
        fingerprints: HashMap.empty(),
        failures: [
          WatchBuild.Failure.InvalidBuildResult({ missing: "metafile" }),
        ],
        warnings: [],
      }),
    }),
  ).toBe(false);
});

it.effect("rejects refresh before the watcher has initialized", () =>
  Effect.gen(function* () {
    const watcher = yield* Watcher.make();
    const refreshed = yield* watcher.refresh.pipe(Effect.result);
    assert(refreshed._tag === "Failure");
    expect(refreshed.failure).toMatchObject({
      _tag: "WatcherOperationError",
      operation: "refresh",
    });
    const actual16 = yield* watcher.diagnostics;
    expect(actual16).toEqual({ errors: [], warnings: [] });
  }),
);

it.effect("owns independent pending work for each watcher", () =>
  Effect.gen(function* () {
    const first = yield* Watcher.make();
    const second = yield* Watcher.make();
    yield* first.requestRetry;
    expect((yield* first.pending).work._tag).toBe("Full");
    const actual17 = yield* second.pending;
    expect(actual17).toEqual(SyncState.empty);
  }),
);

layer(NodeServices.layer)("pending work ownership", (test) => {
  test.effect(
    "requeues work when its consumer is interrupted during coalescing",
    () =>
      Effect.gen(function* () {
        const { watcher, coalescedNext } = yield* controlledWatcher();
        yield* watcher.refresh;
        const initial = yield* coalescedNext.pipe(Effect.forkScoped);
        yield* TestClock.adjust("300 millis");
        expect((yield* Fiber.join(initial)).work._tag).toBe("Full");
        yield* watcher.requestRetry;
        const cancelled = yield* coalescedNext.pipe(Effect.forkScoped);
        yield* TestClock.adjust("100 millis");
        yield* Fiber.interrupt(cancelled);
        expect((yield* watcher.pending).work._tag).toBe("Full");
        const retried = yield* coalescedNext.pipe(Effect.forkScoped);
        yield* TestClock.adjust("300 millis");
        expect((yield* Fiber.join(retried)).work._tag).toBe("Full");
        const actual18 = yield* watcher.pending;
        expect(actual18).toEqual(SyncState.empty);
      }).pipe(Effect.scoped),
  );
});

it("parses reported build rejections without confusing operation errors or malformed diagnostics", () => {
  expect(
    Schema.decodeOption(Watcher.ReportedBuildFailure)({
      errors: [{ text: "syntax error" }],
    }),
  ).toEqual(Option.some({ errors: [{ text: "syntax error" }] }));
  expect(
    Schema.decodeUnknownOption(Watcher.ReportedBuildFailure)({ errors: [] }),
  ).toEqual(Option.none());
  expect(
    Schema.decodeUnknownOption(Watcher.ReportedBuildFailure)({
      errors: ["invalid"],
    }),
  ).toEqual(Option.none());
  expect(
    Schema.decodeUnknownOption(Watcher.ReportedBuildFailure)(
      new Error("service stopped"),
    ),
  ).toEqual(Option.none());
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "topology pending consumption",
  (test) => {
    test.effect.each(["success", "failure"] as const)(
      "coalesces an old-context removal failure with the replacement's initial %s",
      (initialOutcome) =>
        Effect.gen(function* () {
          const oldBlocked = yield* Deferred.make<void>();
          const releaseOld = yield* Deferred.make<void>();
          const initialBlocked = yield* Deferred.make<void>();
          const releaseInitial = yield* Deferred.make<void>();
          const taken = yield* Deferred.make<void>();
          const actual19 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual19);
          const actual20 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual20);
          const contextsCreated = yield* Ref.make(0);
          const { watcher, first, project, events, contexts } =
            yield* controlledWatcher({
              plugins: [
                {
                  name: "gate-removal-observations",
                  setup(build) {
                    const context = runSync(
                      Ref.updateAndGet(contextsCreated, (count) => count + 1),
                    );
                    const builds = Ref.makeUnsafe(0);
                    build.onEnd((result) =>
                      runPromise(
                        Effect.gen(function* () {
                          const buildCount = yield* Ref.updateAndGet(
                            builds,
                            (count) => count + 1,
                          );
                          if (context === 1 && buildCount === 2) {
                            expect(result.errors.length).toBeGreaterThan(0);
                            yield* Deferred.succeed(oldBlocked, undefined);
                            yield* Deferred.await(releaseOld);
                          } else if (context === 2 && buildCount === 1) {
                            expect(result.errors.length > 0).toBe(
                              initialOutcome === "failure",
                            );
                            yield* Deferred.succeed(initialBlocked, undefined);
                            yield* Deferred.await(releaseInitial);
                          }
                        }),
                      ),
                    );
                  },
                },
              ],
            });
          yield* Effect.addFinalizer(() =>
            Effect.all([
              Deferred.succeed(releaseOld, undefined),
              Deferred.succeed(releaseInitial, undefined),
            ]),
          );
          yield* watcher.refresh;
          yield* watcher.next;
          const fs = yield* FileSystem.FileSystem;
          const removed = `${project.root}/confect/notes.spec.ts`;
          yield* fs.remove(removed);
          if (initialOutcome === "failure")
            yield* project.write(
              "confect/notes.impl.ts",
              "export const value = ;",
            );
          const oldBuild = yield* Effect.promise(() =>
            first.actual.rebuild(),
          ).pipe(Effect.exit, Effect.forkScoped);
          yield* Deferred.await(oldBlocked);
          yield* Queue.offer(events, { _tag: "Remove", path: removed });
          yield* Deferred.await(first.disposing);
          const consumer = yield* watcher.next.pipe(
            Effect.tap(() => Deferred.succeed(taken, undefined)),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;
          const done = yield* Deferred.isDone(taken);
          expect(done).toBe(false);
          yield* Deferred.succeed(releaseOld, undefined);
          yield* Fiber.join(oldBuild);
          const replacement = yield* Queue.take(contexts);
          const newBuild = yield* Effect.promise(() =>
            replacement.actual.rebuild(),
          ).pipe(Effect.exit, Effect.forkScoped);
          yield* Deferred.await(initialBlocked);
          expect((yield* watcher.pending).work._tag).toBe("Full");
          const done2 = yield* Deferred.isDone(taken);
          expect(done2).toBe(false);
          yield* Deferred.succeed(releaseInitial, undefined);
          yield* Fiber.join(newBuild);
          expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
          yield* watcher.refresh;
          expect((yield* watcher.pending).work._tag).toBe("None");
          yield* project.write(
            "confect/notes.impl.ts",
            "export const value = 3;",
          );
          yield* watcher.refresh;
          expect((yield* watcher.next).work._tag).toBe("Impls");
          expect((yield* watcher.pending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "abandons an unobserved context when another topology revision replaces it",
      () =>
        Effect.gen(function* () {
          const { watcher, project, events, contexts } =
            yield* controlledWatcher();
          yield* watcher.refresh;
          yield* watcher.next;
          yield* project.write(
            "confect/first.impl.ts",
            "export const value = 1;",
          );
          yield* Queue.offer(events, {
            _tag: "Create",
            path: `${project.root}/confect/first.impl.ts`,
          });
          const abandoned = yield* Queue.take(contexts);
          const taken = yield* Deferred.make<void>();
          const consumer = yield* watcher.next.pipe(
            Effect.tap(() => Deferred.succeed(taken, undefined)),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;
          const done3 = yield* Deferred.isDone(taken);
          expect(done3).toBe(false);
          yield* project.write(
            "confect/second.impl.ts",
            "export const value = 2;",
          );
          yield* Queue.offer(events, {
            _tag: "Create",
            path: `${project.root}/confect/second.impl.ts`,
          });
          const replacement = yield* Queue.take(contexts);
          const done4 = yield* Deferred.isDone(abandoned.disposed);
          expect(done4).toBe(true);
          const done5 = yield* Deferred.isDone(taken);
          expect(done5).toBe(false);
          yield* Effect.promise(() => replacement.actual.rebuild());
          expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
          expect((yield* watcher.pending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect.each([
      ["Create", "notes.spec.ts"],
      ["Remove", "notes.spec.ts"],
      ["Create", "notes.impl.ts"],
      ["Remove", "notes.impl.ts"],
      ["Create", "tables/notes.ts"],
      ["Remove", "tables/notes.ts"],
    ] as const)(
      "preserves targeted work after a delayed %s event for an existing %s",
      ([eventTag, file]) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const { watcher, project, events, contexts } =
            yield* controlledWatcher();
          yield* watcher.refresh;
          yield* watcher.next;
          yield* project.write(`confect/${file}`, "export const value = 2;");
          yield* watcher.refresh;
          const entry = EntryPoint.parse(path.normalize(file));
          assert(entry._tag === "Some");
          const expected = SyncState.add(SyncState.empty, [entry.value]);
          const actual21 = yield* watcher.next;
          expect(actual21).toMatchObject(expected);
          yield* Queue.offer(events, {
            _tag: eventTag,
            path: `${project.root}/confect/${file}`,
          });
          const actual22 = yield* watcher.next;
          expect(actual22).toEqual(expected);
          const actual23 = yield* Queue.poll(contexts);
          expect(actual23).toEqual(Option.none());
          yield* watcher.requestRetry;
          yield* Queue.offer(events, {
            _tag: eventTag,
            path: `${project.root}/confect/${file}`,
          });
          expect((yield* watcher.next).work._tag).toBe("Full");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "settles no-op reconfiguration without replacing the context",
      () =>
        Effect.gen(function* () {
          const { watcher, project, events, contexts } =
            yield* controlledWatcher();
          yield* watcher.refresh;
          yield* watcher.next;
          yield* Queue.offer(events, {
            _tag: "Create",
            path: `${project.root}/confect/notes.spec.ts`,
          });
          const entry = EntryPoint.parse("notes.spec.ts");
          assert(entry._tag === "Some");
          const actual24 = yield* watcher.next;
          expect(actual24).toEqual(
            SyncState.add(SyncState.empty, [entry.value]),
          );
          const actual25 = yield* Queue.poll(contexts);
          expect(actual25).toEqual(Option.none());
          expect((yield* watcher.pending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "settles last-entry removal, preserves optional cleanup, and observes the first new entry",
      () =>
        Effect.gen(function* () {
          const { watcher, first, project, events, contexts } =
            yield* controlledWatcher({ files: ["http.ts"] });
          yield* watcher.refresh;
          yield* watcher.next;
          const fs = yield* FileSystem.FileSystem;
          const file = `${project.root}/confect/http.ts`;
          yield* fs.remove(file);
          yield* Queue.offer(events, { _tag: "Remove", path: file });
          const removed = yield* watcher.next;
          expect(removed.work._tag).toBe("Full");
          expect(HashSet.has(removed.optional, "Http")).toBe(true);
          const done6 = yield* Deferred.isDone(first.disposed);
          expect(done6).toBe(true);
          const actual26 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual26)).toBe(true);
          yield* Queue.offer(events, { _tag: "Remove", path: file });
          const removedAgain = yield* watcher.next;
          expect(removedAgain.work._tag).toBe("None");
          expect(HashSet.has(removedAgain.optional, "Http")).toBe(true);
          yield* project.write("confect/http.ts", "export const value = 2;");
          yield* Queue.offer(events, { _tag: "Create", path: file });
          const replacement = yield* Queue.take(contexts);
          const taken = yield* Deferred.make<void>();
          const consumer = yield* watcher.next.pipe(
            Effect.tap(() => Deferred.succeed(taken, undefined)),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;
          const done7 = yield* Deferred.isDone(taken);
          expect(done7).toBe(false);
          yield* Effect.promise(() => replacement.actual.rebuild());
          const created = yield* Fiber.join(consumer);
          expect(created.work._tag).toBe("Full");
          expect(HashSet.has(created.optional, "Http")).toBe(true);
          expect((yield* watcher.pending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );
  },
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "refresh reconciliation",
  (test) => {
    test.effect.each([false, true])(
      "recovers a generated-only build failure without discarding a concurrent source edit: %s",
      (editSource) =>
        Effect.gen(function* () {
          const actual27 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual27);
          const broken = yield* Ref.make(false);
          const { watcher, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "generated-binding-recovery",
                setup(build) {
                  build.onEnd(() =>
                    Ref.get(broken).pipe(runSync)
                      ? {
                          errors: [
                            { text: "generated binding is being replaced" },
                          ],
                        }
                      : undefined,
                  );
                },
              },
            ],
          });
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(`${project.root}/confect/_generated`, {
            recursive: true,
          });
          yield* project.write(
            "confect/_generated/binding.ts",
            "export const value = 1;",
          );
          yield* project.write(
            "confect/notes.spec.ts",
            'export { value } from "./_generated/binding";',
          );
          const actual28 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual28)).toBe(true);
          yield* watcher.next;
          yield* Ref.set(broken, true);
          yield* project.write(
            "confect/_generated/binding.ts",
            "export const value = 2;",
          );
          const actual29 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual29)).toBe(false);
          expect((yield* watcher.pending).work._tag).toBe("None");
          yield* Ref.set(broken, false);
          if (editSource)
            yield* project.write(
              "confect/notes.spec.ts",
              'export { value } from "./_generated/binding"; export const changed = true;',
            );
          const actual30 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual30)).toBe(true);
          expect((yield* watcher.next).work._tag).toBe(
            editSource ? "Declarations" : "Reconcile",
          );
          const actual31 = yield* watcher.diagnostics;
          expect(actual31).toEqual({
            errors: [],
            warnings: [],
          });
          expect((yield* watcher.pending).work._tag).toBe("None");
        }).pipe(Effect.scoped),
    );

    test.effect(
      "requests only one rebuild when quiescent and preserves queued edits",
      () =>
        Effect.gen(function* () {
          const { watcher, first, project } = yield* controlledWatcher();
          const actual32 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual32)).toBe(true);
          const current7 = yield* Ref.get(first.rebuilds);
          expect(current7).toBe(1);
          yield* watcher.next;
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const actual33 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual33)).toBe(true);
          const current8 = yield* Ref.get(first.rebuilds);
          expect(current8).toBe(2);
          expect((yield* watcher.pending).work._tag).toBe("Declarations");
          yield* watcher.refresh;
          const current9 = yield* Ref.get(first.rebuilds);
          expect(current9).toBe(3);
          expect((yield* watcher.pending).work._tag).toBe("Declarations");
        }).pipe(Effect.scoped),
    );

    test.effect(
      "rebuilds a stale joined completion even when a newer generation has started",
      () =>
        Effect.gen(function* () {
          const staleBlocked = yield* Deferred.make<void>();
          const releaseStale = yield* Deferred.make<void>();
          const freshBlocked = yield* Deferred.make<void>();
          const releaseFresh = yield* Deferred.make<void>();
          const joinedStale = yield* Deferred.make<void>();
          const joinedFresh = yield* Deferred.make<void>();
          const refreshed = yield* Deferred.make<void>();
          const actual34 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual34);
          const builds = yield* Ref.make(0);
          const requests = yield* Ref.make(0);
          const newerBuild = yield* Deferred.make<esbuild.BuildResult>();
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-build-completions",
                setup(build) {
                  build.onEnd(() =>
                    runPromise(
                      Effect.gen(function* () {
                        const buildCount = yield* Ref.updateAndGet(
                          builds,
                          (count) => count + 1,
                        );
                        if (buildCount === 2) {
                          yield* Deferred.succeed(staleBlocked, undefined);
                          yield* Deferred.await(releaseStale);
                        } else if (buildCount === 3) {
                          yield* Deferred.succeed(freshBlocked, undefined);
                          yield* Deferred.await(releaseFresh);
                        }
                      }),
                    ),
                  );
                },
              },
            ],
            rebuild: (actual) =>
              runPromise(
                Effect.gen(function* () {
                  const requestCount = yield* Ref.updateAndGet(
                    requests,
                    (count) => count + 1,
                  );
                  if (requestCount === 3)
                    yield* Deferred.succeed(joinedFresh, undefined);
                  const built = actual.rebuild();
                  if (requestCount !== 2)
                    return yield* Effect.promise(() => built);
                  yield* Deferred.succeed(joinedStale, undefined);
                  const stale = yield* Effect.promise(() => built);
                  const advanced = actual.rebuild();
                  yield* Deferred.completeWith(
                    newerBuild,
                    Effect.promise(() => advanced),
                  );
                  yield* Deferred.await(freshBlocked);
                  return stale;
                }),
              ),
          });
          yield* watcher.refresh;
          yield* watcher.next;
          const active = yield* Effect.promise(() =>
            first.actual.rebuild(),
          ).pipe(Effect.forkScoped);
          yield* Deferred.await(staleBlocked);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const refreshing = yield* watcher.refresh.pipe(
            Effect.tap(() => Deferred.succeed(refreshed, undefined)),
            Effect.forkScoped,
          );
          yield* Deferred.await(joinedStale);
          yield* Deferred.succeed(releaseStale, undefined);
          yield* Deferred.await(joinedFresh);
          const prematurelyRefreshed = yield* Deferred.isDone(refreshed);
          const prematurePending = yield* watcher.pending;
          yield* Deferred.succeed(releaseFresh, undefined);
          const joined2 = yield* Fiber.join(refreshing);
          expect(Watcher.isRefreshSuccessful(joined2)).toBe(true);
          yield* Fiber.join(active);
          expect(prematurelyRefreshed).toBe(false);
          expect(SyncState.isDirty(prematurePending)).toBe(false);
          yield* Deferred.await(newerBuild);
          const current10 = yield* Ref.get(first.rebuilds);
          expect(current10).toBe(3);
          const current11 = yield* Ref.get(builds);
          expect(current11).toBe(3);
          expect((yield* watcher.pending).work._tag).toBe("Declarations");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );
  },
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "refresh failures and lifecycle",
  (test) => {
    test.effect(
      "keeps verification read failures readable at the dev logging boundary",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const actual35 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual35);
          const actual36 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual36);
          const removeInput = yield* Ref.make(true);
          const { watcher, first, project } = yield* controlledWatcher({
            afterPlugins: [
              {
                name: "remove-after-observation",
                setup(build) {
                  const root = build.initialOptions.absWorkingDir;
                  assert(root);
                  build.onEnd(() =>
                    Ref.get(removeInput).pipe(runSync)
                      ? runPromise(
                          fs.remove(path.join(root, "confect/notes.spec.ts")),
                        )
                      : undefined,
                  );
                },
              },
            ],
          });
          const refreshed = yield* watcher.refresh.pipe(Effect.result);
          assert(refreshed._tag === "Failure");
          expect(refreshed.failure.operation).toBe("refresh");
          expect(PlatformError.isPlatformError(refreshed.failure.cause)).toBe(
            true,
          );
          const message = String(refreshed.failure.cause);
          expect(message).toContain(
            path.join(project.root, "confect/notes.spec.ts"),
          );
          expect(message).toContain("readFile");
          expect(message).not.toContain("[object Object]");
          const current12 = yield* Ref.get(first.rebuilds);
          expect(current12).toBe(1);
          yield* Ref.set(removeInput, false);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const actual37 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual37)).toBe(true);
          const current13 = yield* Ref.get(first.rebuilds);
          expect(current13).toBe(2);
        }).pipe(Effect.scoped),
    );

    test.effect.each(["success", "failure"] as const)(
      "refreshes a canceled request's %s whose observer has already finished",
      (previous) =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const joined = yield* Deferred.make<void>();
          const actual38 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual38);
          const actual39 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual39);
          const shouldBlock = yield* Ref.make(true);
          const requests = yield* Ref.make(0);
          const { watcher, first, project } = yield* controlledWatcher({
            afterPlugins: [
              {
                name: "gate-after-observation",
                setup(build) {
                  build.onEnd(() =>
                    Ref.get(shouldBlock).pipe(runSync)
                      ? runPromise(
                          Effect.gen(function* () {
                            yield* Deferred.succeed(blocked, undefined);
                            yield* Deferred.await(release);
                          }),
                        )
                      : undefined,
                  );
                },
              },
            ],
            rebuild: (actual) => {
              const requestCount = runSync(
                Ref.updateAndGet(requests, (count) => count + 1),
              );
              const built = actual.rebuild();
              if (requestCount === 2) Deferred.doneUnsafe(joined, Effect.void);
              return built;
            },
          });
          if (previous === "failure")
            yield* project.write(
              "confect/notes.spec.ts",
              "export const value = ;",
            );
          const canceled = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* Fiber.interrupt(canceled);
          yield* project.write(
            "confect/notes.spec.ts",
            previous === "failure"
              ? "export const value = 2;"
              : "export const value = ;",
          );
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(joined);
          yield* Ref.set(shouldBlock, false);
          yield* Deferred.succeed(release, undefined);
          const joined3 = yield* Fiber.join(refreshing);
          expect(Watcher.isRefreshSuccessful(joined3)).toBe(
            previous === "failure",
          );
          const current14 = yield* Ref.get(first.rebuilds);
          expect(current14).toBe(3);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "reconciles an edit after a fresh build reads its inputs but before it completes",
      () =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const actual40 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual40);
          const actual41 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual41);
          const shouldBlock = yield* Ref.make(false);
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-fresh-build-completion",
                setup(build) {
                  build.onEnd(() =>
                    Ref.get(shouldBlock).pipe(runSync)
                      ? runPromise(
                          Effect.gen(function* () {
                            yield* Deferred.succeed(blocked, undefined);
                            yield* Deferred.await(release);
                          }),
                        )
                      : undefined,
                  );
                },
              },
            ],
          });
          yield* watcher.refresh;
          yield* watcher.next;
          yield* Ref.set(shouldBlock, true);
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          yield* Ref.set(shouldBlock, false);
          yield* Deferred.succeed(release, undefined);
          const joined4 = yield* Fiber.join(refreshing);
          expect(Watcher.isRefreshSuccessful(joined4)).toBe(true);
          expect((yield* watcher.pending).work._tag).toBe("Declarations");
          const current15 = yield* Ref.get(first.rebuilds);
          expect(current15).toBe(3);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "reconciles a reported failure from a joined pre-barrier build",
      () =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const joined = yield* Deferred.make<void>();
          const actual42 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual42);
          const actual43 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual43);
          const shouldBlock = yield* Ref.make(true);
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-stale-failure",
                setup(build) {
                  build.onEnd(() =>
                    Ref.get(shouldBlock).pipe(runSync)
                      ? runPromise(
                          Effect.gen(function* () {
                            yield* Deferred.succeed(blocked, undefined);
                            yield* Deferred.await(release);
                          }),
                        )
                      : undefined,
                  );
                },
              },
            ],
            rebuild: (actual) => {
              const built = actual.rebuild();
              Deferred.doneUnsafe(joined, Effect.void);
              return built;
            },
          });
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = ;",
          );
          const active = yield* Effect.tryPromise({
            try: () => first.actual.rebuild(),
            catch: (cause) => RebuildError.make({ cause }),
          }).pipe(Effect.result, Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(joined);
          yield* Ref.set(shouldBlock, false);
          yield* Deferred.succeed(release, undefined);
          const joined5 = yield* Fiber.join(refreshing);
          expect(Watcher.isRefreshSuccessful(joined5)).toBe(true);
          const joined6 = yield* Fiber.join(active);
          expect(Result.isFailure(joined6)).toBe(true);
          const current16 = yield* Ref.get(first.rebuilds);
          expect(current16).toBe(2);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect.each(["reported", "metadata"] as const)(
      "returns the exact %s failure observation and recovers on the next request",
      (kind) =>
        Effect.gen(function* () {
          const actual44 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual44);
          const broken = yield* Ref.make(false);
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "inject-missing-metadata",
                setup(build) {
                  build.onEnd((result) => {
                    if (Ref.get(broken).pipe(runSync) && kind === "metadata")
                      result.metafile = undefined;
                  });
                },
              },
            ],
          });
          yield* watcher.refresh;
          yield* Ref.set(broken, true);
          if (kind === "reported")
            yield* project.write(
              "confect/notes.spec.ts",
              "export const value = ;",
            );
          const refreshed = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(refreshed)).toBe(false);
          assert(
            refreshed._tag === "Observed" &&
              refreshed.outcome._tag === "Failed",
          );
          expect(refreshed.outcome.failures[0]._tag).toBe(
            kind === "reported" ? "BuildFailed" : "InvalidBuildResult",
          );
          expect((yield* watcher.diagnostics).errors).toEqual(
            WatchBuild.messages(refreshed.outcome),
          );
          const current17 = yield* Ref.get(first.rebuilds);
          expect(current17).toBe(2);
          yield* Ref.set(broken, false);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const actual45 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual45)).toBe(true);
          const current18 = yield* Ref.get(first.rebuilds);
          expect(current18).toBe(3);
          expect((yield* watcher.diagnostics).errors).toEqual([]);
        }).pipe(Effect.scoped),
    );

    test.effect.each([
      "operation",
      "reported-with-success",
      "unobserved-reported",
      "unobserved-success",
    ] as const)(
      "preserves error precedence for %s without reusing a historical observation",
      (kind) =>
        Effect.gen(function* () {
          const actual46 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual46);
          const broken = yield* Ref.make(false);
          const operationFailure = new Error("service stopped");
          const reportedFailure = { errors: [{ text: "rebuild rejected" }] };
          const { watcher, first, project } = yield* controlledWatcher({
            rebuild: (actual) => {
              if (!Ref.get(broken).pipe(runSync)) return actual.rebuild();
              switch (kind) {
                case "operation":
                  return actual.rebuild().then(
                    () => Promise.reject(operationFailure),
                    () => Promise.reject(operationFailure),
                  );
                case "reported-with-success":
                  return actual
                    .rebuild()
                    .then(() => Promise.reject(reportedFailure));
                case "unobserved-reported":
                  return Promise.reject(reportedFailure);
                case "unobserved-success":
                  return Promise.resolve({
                    errors: [],
                    warnings: [],
                    mangleCache: undefined,
                    outputFiles: undefined,
                    metafile: undefined,
                  });
              }
            },
          });
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = ;",
          );
          const actual47 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual47)).toBe(false);
          yield* Ref.set(broken, true);
          if (kind === "reported-with-success")
            yield* project.write(
              "confect/notes.spec.ts",
              "export const value = 2;",
            );
          const refreshed = yield* watcher.refresh.pipe(Effect.result);
          assert(refreshed._tag === "Failure");
          expect(refreshed.failure).toMatchObject({
            _tag: "WatcherOperationError",
            operation: "rebuild",
          });
          expect(refreshed.failure.cause).toEqual(
            kind === "operation"
              ? operationFailure
              : kind === "unobserved-success"
                ? "esbuild completed without a build observation"
                : reportedFailure.errors,
          );
          const current19 = yield* Ref.get(first.rebuilds);
          expect(current19).toBe(2);
          yield* Ref.set(broken, false);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 3;",
          );
          const actual48 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual48)).toBe(true);
          const current20 = yield* Ref.get(first.rebuilds);
          expect(current20).toBe(3);
        }).pipe(Effect.scoped),
    );

    test.effect.each(["confect/extra.impl.ts", "convex/convex.config.ts"])(
      "pins the context and immediately invalidates queued creation of %s",
      (file) =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const actual49 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual49);
          const actual50 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual50);
          const shouldBlock = yield* Ref.make(false);
          const { watcher, first, project, events, configEvents, contexts } =
            yield* controlledWatcher({
              plugins: [
                {
                  name: "gate-context-replacement",
                  setup(build) {
                    build.onEnd(() =>
                      Ref.get(shouldBlock).pipe(runSync)
                        ? runPromise(
                            Effect.gen(function* () {
                              yield* Deferred.succeed(blocked, undefined);
                              yield* Deferred.await(release);
                            }),
                          )
                        : undefined,
                    );
                  },
                },
              ],
            });
          yield* watcher.refresh;
          yield* watcher.refresh;
          yield* watcher.next;
          yield* Ref.set(shouldBlock, true);
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* project.write(file, "export const value = 2;");
          yield* Queue.offer(
            pipe(file, Str.startsWith("confect/")) ? events : configEvents,
            {
              _tag: "Create",
              path: `${project.root}/${file}`,
            },
          );
          yield* Effect.yieldNow;
          const prematurelyDisposed = yield* Deferred.isDone(first.disposing);
          const queued = yield* watcher.pending;
          yield* Ref.set(shouldBlock, false);
          yield* Deferred.succeed(release, undefined);
          const joined7 = yield* Fiber.join(refreshing);
          expect(Watcher.isRefreshSuccessful(joined7)).toBe(true);
          const replacement = yield* Queue.take(contexts);
          expect(prematurelyDisposed).toBe(false);
          expect(queued.work._tag).toBe(
            pipe(file, Str.startsWith("confect/")) ? "Impls" : "Full",
          );
          const done8 = yield* Deferred.isDone(first.disposed);
          expect(done8).toBe(true);
          const actual51 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual51)).toBe(true);
          const current21 = yield* Ref.get(replacement.rebuilds);
          expect(current21).toBe(1);
          const current22 = yield* Ref.get(first.rebuilds);
          expect(current22).toBe(3);
          expect((yield* watcher.pending).work._tag).toBe("Full");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "cleans up an interrupted request before later build completions",
      () =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const actual52 = yield* Effect.context();
          const runPromise = Effect.runPromiseWith(actual52);
          const actual53 = yield* Effect.context();
          const runSync = Effect.runSyncWith(actual53);
          const shouldBlock = yield* Ref.make(true);
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-interrupted-refresh",
                setup(build) {
                  build.onEnd(() =>
                    Ref.get(shouldBlock).pipe(runSync)
                      ? runPromise(
                          Effect.gen(function* () {
                            yield* Deferred.succeed(blocked, undefined);
                            yield* Deferred.await(release);
                          }),
                        )
                      : undefined,
                  );
                },
              },
            ],
          });
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* Fiber.interrupt(refreshing);
          yield* Ref.set(shouldBlock, false);
          yield* Deferred.succeed(release, undefined);
          yield* watcher.next;
          yield* Effect.promise(() => first.actual.rebuild());
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = ;",
          );
          const actual54 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual54)).toBe(false);
          const current23 = yield* Ref.get(first.rebuilds);
          expect(current23).toBe(2);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const actual55 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual55)).toBe(true);
          const current24 = yield* Ref.get(first.rebuilds);
          expect(current24).toBe(3);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );
  },
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "directory watch recovery",
  (test) => {
    test.effect(
      "settles initially empty topology and acknowledges a recursive-watch rescan",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const confect = path.join(project.root, "confect");
          for (const file of [
            "notes.spec.ts",
            "notes.impl.ts",
            "tables/notes.ts",
          ])
            yield* fs.remove(path.join(confect, file));
          const error = PlatformError.systemError({
            _tag: "Unknown",
            module: "FileSystem",
            method: "watch",
            pathOrDescriptor: confect,
            cause: {
              code: "ENOENT",
              syscall: "scandir",
              path: path.join(confect, "removed"),
            },
          });
          const fail = yield* Deferred.make<void>();
          const restored = yield* Deferred.make<void>();
          const subscriptions = yield* Ref.make(0);

          const watcher = yield* Watcher.make();
          yield* watcher.run.pipe(
            project.provide,
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              watch: (directory) =>
                directory === confect
                  ? Stream.unwrap(
                      Ref.updateAndGet(
                        subscriptions,
                        (count) => count + 1,
                      ).pipe(
                        Effect.map((count) =>
                          count === 1
                            ? fail.pipe(
                                Deferred.await,
                                Stream.fromEffect,
                                Stream.flatMap(() => Stream.fail(error)),
                              )
                            : Stream.fromEffect(
                                Deferred.succeed(restored, undefined),
                              ).pipe(Stream.drain, Stream.concat(Stream.never)),
                        ),
                      ),
                    )
                  : Stream.never,
            }),
            Effect.forkScoped,
          );
          expect((yield* watcher.next).work._tag).toBe("Full");
          const actual56 = yield* watcher.refresh;
          expect(Watcher.isRefreshSuccessful(actual56)).toBe(true);
          yield* Deferred.succeed(fail, undefined);
          yield* Deferred.await(restored);
          expect((yield* watcher.next).work._tag).toBe("Full");
          expect((yield* watcher.pending).work._tag).toBe("None");
          const current25 = yield* Ref.get(subscriptions);
          expect(current25).toBe(2);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect.each([
      {
        name: "removed child directory",
        code: "ENOENT",
        child: true,
        recover: true,
      },
      {
        name: "removed root directory",
        code: "ENOENT",
        child: false,
        recover: false,
      },
      {
        name: "permission failure",
        code: "EACCES",
        child: true,
        recover: false,
      },
    ])(
      "handles $name without hiding unrelated errors",
      ({ code, child, recover }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const confect = path.join(project.root, "confect");
          const error = PlatformError.systemError({
            _tag: "Unknown",
            module: "FileSystem",
            method: "watch",
            pathOrDescriptor: confect,
            cause: {
              code,
              syscall: "scandir",
              path: child ? path.join(confect, "removed") : confect,
            },
          });
          const restored = yield* Deferred.make<void>();
          const subscriptions = yield* Ref.make(0);

          const watcher = yield* Watcher.make();
          const running = watcher.run.pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(confect),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              watch: (directory, options) =>
                directory === confect
                  ? Stream.unwrap(
                      Ref.updateAndGet(
                        subscriptions,
                        (count) => count + 1,
                      ).pipe(
                        Effect.map((count) =>
                          count === 1
                            ? Stream.fail(error)
                            : Stream.fromEffect(
                                Deferred.succeed(restored, undefined),
                              ).pipe(Stream.drain, Stream.concat(Stream.never)),
                        ),
                      ),
                    )
                  : fs.watch(directory, options),
            }),
          );
          if (recover) {
            const fiber = yield* running.pipe(Effect.forkScoped);
            yield* Deferred.await(restored).pipe(Effect.timeout("5 seconds"));
            yield* Fiber.interrupt(fiber);
            const current26 = yield* Ref.get(subscriptions);
            expect(current26).toBe(2);
          } else {
            const result = yield* running.pipe(Effect.result);
            assert(result._tag === "Failure");
            expect(result.failure).toBe(error);
            const current27 = yield* Ref.get(subscriptions);
            expect(current27).toBe(1);
          }
        }).pipe(Effect.scoped),
      { timeout: 15000 },
    );
  },
);
