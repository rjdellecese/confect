import { assert, expect, it, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as esbuild from "esbuild";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Watcher from "@confect/cli/Watcher";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as SyncState from "@confect/cli/SyncState";
import * as WatchBuild from "@confect/cli/WatchBuild";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
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

const controlledWatcher = Effect.fnUntraced(function* (
  options: {
    readonly files?: ReadonlyArray<string>;
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
  if (options.files)
    for (const file of ["notes.spec.ts", "notes.impl.ts", "tables/notes.ts"])
      if (!options.files.includes(file))
        yield* fs.remove(path.join(project.root, "confect", file));
  for (const file of options.files ?? [
    "notes.spec.ts",
    "notes.impl.ts",
    "tables/notes.ts",
  ])
    yield* project.write(`confect/${file}`, "export const value = 1;");
  const signal = yield* Queue.unbounded<void>();
  const pending = yield* Ref.make(SyncState.empty);
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
  const runPromise = Effect.runPromiseWith(yield* Effect.context());
  const runSync = Effect.runSyncWith(yield* Effect.context());
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
            return options.rebuild ? options.rebuild(actual) : actual.rebuild();
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
  const watcher = yield* Watcher.make(signal, pending);
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
  return {
    watcher,
    project,
    signal,
    pending,
    events,
    configEvents,
    contexts,
    first,
  };
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
    const signal = yield* Queue.sliding<void>(1);
    const pending = yield* Ref.make(SyncState.empty);
    const watcher = yield* Watcher.make(signal, pending);
    const refreshed = yield* watcher.refresh.pipe(Effect.result);
    assert(Result.isFailure(refreshed));
    expect(refreshed.failure).toMatchObject({
      _tag: "WatcherOperationError",
      operation: "refresh",
    });
    expect(yield* watcher.diagnostics).toEqual({ errors: [], warnings: [] });
  }),
);

it("parses reported build rejections without confusing operation errors or malformed diagnostics", () => {
  expect(Watcher.parseFailure({ errors: [{ text: "syntax error" }] })).toEqual(
    Option.some({ errors: [{ text: "syntax error" }] }),
  );
  expect(Watcher.parseFailure({ errors: [] })).toEqual(Option.none());
  expect(Watcher.parseFailure({ errors: ["invalid"] })).toEqual(Option.none());
  expect(Watcher.parseFailure(new Error("service stopped"))).toEqual(
    Option.none(),
  );
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
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let contextsCreated = 0;
          const { watcher, first, project, events, contexts, pending } =
            yield* controlledWatcher({
              plugins: [
                {
                  name: "gate-removal-observations",
                  setup(build) {
                    const context = ++contextsCreated;
                    let builds = 0;
                    build.onEnd((result) =>
                      runPromise(
                        Effect.gen(function* () {
                          builds++;
                          if (context === 1 && builds === 2) {
                            expect(result.errors.length).toBeGreaterThan(0);
                            yield* Deferred.succeed(oldBlocked, undefined);
                            yield* Deferred.await(releaseOld);
                          } else if (context === 2 && builds === 1) {
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
          yield* watcher.takePending;
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
          const consumer = yield* watcher.takePending.pipe(
            Effect.tap(() => Deferred.succeed(taken, undefined)),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;
          expect(yield* Deferred.isDone(taken)).toBe(false);
          yield* Deferred.succeed(releaseOld, undefined);
          yield* Fiber.join(oldBuild);
          const replacement = yield* Queue.take(contexts);
          const newBuild = yield* Effect.promise(() =>
            replacement.actual.rebuild(),
          ).pipe(Effect.exit, Effect.forkScoped);
          yield* Deferred.await(initialBlocked);
          expect((yield* Ref.get(pending)).work._tag).toBe("Full");
          expect(yield* Deferred.isDone(taken)).toBe(false);
          yield* Deferred.succeed(releaseInitial, undefined);
          yield* Fiber.join(newBuild);
          expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
          yield* watcher.refresh;
          expect((yield* watcher.takePending).work._tag).toBe("None");
          yield* project.write(
            "confect/notes.impl.ts",
            "export const value = 3;",
          );
          yield* watcher.refresh;
          expect((yield* watcher.takePending).work._tag).toBe("Impls");
          expect((yield* watcher.takePending).work._tag).toBe("None");
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
          yield* watcher.takePending;
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
          const consumer = yield* watcher.takePending.pipe(
            Effect.tap(() => Deferred.succeed(taken, undefined)),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;
          expect(yield* Deferred.isDone(taken)).toBe(false);
          yield* project.write(
            "confect/second.impl.ts",
            "export const value = 2;",
          );
          yield* Queue.offer(events, {
            _tag: "Create",
            path: `${project.root}/confect/second.impl.ts`,
          });
          const replacement = yield* Queue.take(contexts);
          expect(yield* Deferred.isDone(abandoned.disposed)).toBe(true);
          expect(yield* Deferred.isDone(taken)).toBe(false);
          yield* Effect.promise(() => replacement.actual.rebuild());
          expect((yield* Fiber.join(consumer)).work._tag).toBe("Full");
          expect((yield* watcher.takePending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "settles no-op reconfiguration without replacing the context",
      () =>
        Effect.gen(function* () {
          const { watcher, project, events, contexts, signal } =
            yield* controlledWatcher();
          yield* watcher.refresh;
          yield* watcher.takePending;
          yield* Queue.poll(signal).pipe(
            Effect.repeat({ while: (message) => Option.isSome(message) }),
          );
          yield* Queue.offer(events, {
            _tag: "Create",
            path: `${project.root}/confect/notes.spec.ts`,
          });
          yield* Queue.take(signal);
          expect((yield* watcher.takePending).work._tag).toBe("Full");
          expect(yield* Queue.poll(contexts)).toEqual(Option.none());
          expect((yield* watcher.takePending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "settles last-entry removal, preserves optional cleanup, and observes the first new entry",
      () =>
        Effect.gen(function* () {
          const { watcher, first, project, events, contexts, signal } =
            yield* controlledWatcher({ files: ["http.ts"] });
          yield* watcher.refresh;
          yield* watcher.takePending;
          yield* Queue.poll(signal).pipe(
            Effect.repeat({ while: (message) => Option.isSome(message) }),
          );
          const fs = yield* FileSystem.FileSystem;
          const file = `${project.root}/confect/http.ts`;
          yield* fs.remove(file);
          yield* Queue.offer(events, { _tag: "Remove", path: file });
          yield* Queue.take(signal);
          const removed = yield* watcher.takePending;
          expect(removed.work._tag).toBe("Full");
          expect(HashSet.has(removed.optional, "Http")).toBe(true);
          expect(yield* Deferred.isDone(first.disposed)).toBe(true);
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          yield* Queue.poll(signal).pipe(
            Effect.repeat({ while: (message) => Option.isSome(message) }),
          );
          yield* Queue.offer(events, { _tag: "Remove", path: file });
          yield* Queue.take(signal);
          expect((yield* watcher.takePending).work._tag).toBe("Full");
          yield* project.write("confect/http.ts", "export const value = 2;");
          yield* Queue.offer(events, { _tag: "Create", path: file });
          const replacement = yield* Queue.take(contexts);
          const taken = yield* Deferred.make<void>();
          const consumer = yield* watcher.takePending.pipe(
            Effect.tap(() => Deferred.succeed(taken, undefined)),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;
          expect(yield* Deferred.isDone(taken)).toBe(false);
          yield* Effect.promise(() => replacement.actual.rebuild());
          const created = yield* Fiber.join(consumer);
          expect(created.work._tag).toBe("Full");
          expect(HashSet.has(created.optional, "Http")).toBe(true);
          expect((yield* watcher.takePending).work._tag).toBe("None");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );
  },
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "refresh reconciliation",
  (test) => {
    test.effect(
      "requests only one rebuild when quiescent and preserves queued edits",
      () =>
        Effect.gen(function* () {
          const { watcher, first, pending, project } =
            yield* controlledWatcher();
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(1);
          yield* Ref.set(pending, SyncState.empty);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(2);
          expect((yield* Ref.get(pending)).work._tag).toBe("Declarations");
          yield* watcher.refresh;
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
          expect((yield* Ref.get(pending)).work._tag).toBe("Declarations");
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
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let builds = 0;
          let requests = 0;
          let newerBuild: Promise<esbuild.BuildResult> | undefined;
          const { watcher, first, project, pending } = yield* controlledWatcher(
            {
              plugins: [
                {
                  name: "gate-build-completions",
                  setup(build) {
                    build.onEnd(() =>
                      runPromise(
                        Effect.gen(function* () {
                          builds++;
                          if (builds === 2) {
                            yield* Deferred.succeed(staleBlocked, undefined);
                            yield* Deferred.await(releaseStale);
                          } else if (builds === 3) {
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
                    requests++;
                    if (requests === 3)
                      yield* Deferred.succeed(joinedFresh, undefined);
                    const built = actual.rebuild();
                    if (requests !== 2)
                      return yield* Effect.promise(() => built);
                    yield* Deferred.succeed(joinedStale, undefined);
                    const stale = yield* Effect.promise(() => built);
                    newerBuild = actual.rebuild();
                    yield* Deferred.await(freshBlocked);
                    return stale;
                  }),
                ),
            },
          );
          yield* watcher.refresh;
          yield* Ref.set(pending, SyncState.empty);
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
          const prematurePending = yield* Ref.get(pending);
          yield* Deferred.succeed(releaseFresh, undefined);
          expect(
            Watcher.isRefreshSuccessful(yield* Fiber.join(refreshing)),
          ).toBe(true);
          yield* Fiber.join(active);
          expect(prematurelyRefreshed).toBe(false);
          expect(SyncState.isDirty(prematurePending)).toBe(false);
          const advanced = newerBuild;
          assert(advanced);
          yield* Effect.promise(() => advanced);
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
          expect(builds).toBe(3);
          expect((yield* Ref.get(pending)).work._tag).toBe("Declarations");
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
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let removeInput = true;
          const { watcher, first, project } = yield* controlledWatcher({
            afterPlugins: [
              {
                name: "remove-after-observation",
                setup(build) {
                  const root = build.initialOptions.absWorkingDir;
                  assert(root);
                  build.onEnd(() =>
                    removeInput
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
          assert(Result.isFailure(refreshed));
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
          expect(yield* Ref.get(first.rebuilds)).toBe(1);
          removeInput = false;
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(2);
        }).pipe(Effect.scoped),
    );

    test.effect.each(["success", "failure"] as const)(
      "refreshes a canceled request's %s whose observer has already finished",
      (previous) =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const joined = yield* Deferred.make<void>();
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let shouldBlock = true;
          let requests = 0;
          const { watcher, first, project } = yield* controlledWatcher({
            afterPlugins: [
              {
                name: "gate-after-observation",
                setup(build) {
                  build.onEnd(() =>
                    shouldBlock
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
              requests++;
              const built = actual.rebuild();
              if (requests === 2) Deferred.doneUnsafe(joined, Effect.void);
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
          shouldBlock = false;
          yield* Deferred.succeed(release, undefined);
          expect(
            Watcher.isRefreshSuccessful(yield* Fiber.join(refreshing)),
          ).toBe(previous === "failure");
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "reconciles an edit after a fresh build reads its inputs but before it completes",
      () =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let shouldBlock = false;
          const { watcher, first, project, pending } = yield* controlledWatcher(
            {
              plugins: [
                {
                  name: "gate-fresh-build-completion",
                  setup(build) {
                    build.onEnd(() =>
                      shouldBlock
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
            },
          );
          yield* watcher.refresh;
          yield* Ref.set(pending, SyncState.empty);
          shouldBlock = true;
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          shouldBlock = false;
          yield* Deferred.succeed(release, undefined);
          expect(
            Watcher.isRefreshSuccessful(yield* Fiber.join(refreshing)),
          ).toBe(true);
          expect((yield* Ref.get(pending)).work._tag).toBe("Declarations");
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
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
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let shouldBlock = true;
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-stale-failure",
                setup(build) {
                  build.onEnd(() =>
                    shouldBlock
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
          const active = yield* Effect.tryPromise(() =>
            first.actual.rebuild(),
          ).pipe(Effect.result, Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(joined);
          shouldBlock = false;
          yield* Deferred.succeed(release, undefined);
          expect(
            Watcher.isRefreshSuccessful(yield* Fiber.join(refreshing)),
          ).toBe(true);
          expect(Result.isFailure(yield* Fiber.join(active))).toBe(true);
          expect(yield* Ref.get(first.rebuilds)).toBe(2);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect.each(["reported", "metadata"] as const)(
      "returns the exact %s failure observation and recovers on the next request",
      (kind) =>
        Effect.gen(function* () {
          let broken = false;
          const { watcher, first, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "inject-missing-metadata",
                setup(build) {
                  build.onEnd((result) => {
                    if (broken && kind === "metadata")
                      result.metafile = undefined;
                  });
                },
              },
            ],
          });
          yield* watcher.refresh;
          broken = true;
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
          expect(yield* Ref.get(first.rebuilds)).toBe(2);
          broken = false;
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
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
          let broken = false;
          const operationFailure = new Error("service stopped");
          const reportedFailure = { errors: [{ text: "rebuild rejected" }] };
          const { watcher, first, project } = yield* controlledWatcher({
            rebuild: (actual) => {
              if (!broken) return actual.rebuild();
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
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            false,
          );
          broken = true;
          if (kind === "reported-with-success")
            yield* project.write(
              "confect/notes.spec.ts",
              "export const value = 2;",
            );
          const refreshed = yield* watcher.refresh.pipe(Effect.result);
          assert(Result.isFailure(refreshed));
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
          expect(yield* Ref.get(first.rebuilds)).toBe(2);
          broken = false;
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 3;",
          );
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
        }).pipe(Effect.scoped),
    );

    test.effect.each(["confect/extra.impl.ts", "convex/convex.config.ts"])(
      "pins the context and immediately invalidates queued creation of %s",
      (file) =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let shouldBlock = false;
          const {
            watcher,
            first,
            project,
            events,
            configEvents,
            contexts,
            pending,
          } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-context-replacement",
                setup(build) {
                  build.onEnd(() =>
                    shouldBlock
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
          yield* Ref.set(pending, SyncState.empty);
          shouldBlock = true;
          const refreshing = yield* watcher.refresh.pipe(Effect.forkScoped);
          yield* Deferred.await(blocked);
          yield* project.write(file, "export const value = 2;");
          yield* Queue.offer(
            file.startsWith("confect/") ? events : configEvents,
            {
              _tag: "Create",
              path: `${project.root}/${file}`,
            },
          );
          yield* Effect.yieldNow;
          const prematurelyDisposed = yield* Deferred.isDone(first.disposing);
          const queued = yield* Ref.get(pending);
          shouldBlock = false;
          yield* Deferred.succeed(release, undefined);
          expect(
            Watcher.isRefreshSuccessful(yield* Fiber.join(refreshing)),
          ).toBe(true);
          const replacement = yield* Queue.take(contexts);
          expect(prematurelyDisposed).toBe(false);
          expect(queued.work._tag).toBe("Full");
          expect(yield* Deferred.isDone(first.disposed)).toBe(true);
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(replacement.rebuilds)).toBe(1);
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
      { timeout: 15000 },
    );

    test.effect(
      "cleans up an interrupted request before later build completions",
      () =>
        Effect.gen(function* () {
          const blocked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          let shouldBlock = true;
          const { watcher, first, signal, project } = yield* controlledWatcher({
            plugins: [
              {
                name: "gate-interrupted-refresh",
                setup(build) {
                  build.onEnd(() =>
                    shouldBlock
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
          shouldBlock = false;
          yield* Deferred.succeed(release, undefined);
          yield* Queue.take(signal);
          yield* Effect.promise(() => first.actual.rebuild());
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = ;",
          );
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            false,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(2);
          yield* project.write(
            "confect/notes.spec.ts",
            "export const value = 2;",
          );
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          expect(yield* Ref.get(first.rebuilds)).toBe(3);
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
          let subscriptions = 0;
          const signal = yield* Queue.sliding<void>(1);
          const pending = yield* Ref.make(SyncState.empty);
          const watcher = yield* Watcher.make(signal, pending);
          yield* watcher.run.pipe(
            project.provide,
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              watch: (directory) =>
                directory === confect
                  ? Stream.suspend(() => {
                      subscriptions++;
                      return subscriptions === 1
                        ? Stream.fromEffect(Deferred.await(fail)).pipe(
                            Stream.flatMap(() => Stream.fail(error)),
                          )
                        : Stream.fromEffect(
                            Deferred.succeed(restored, undefined),
                          ).pipe(Stream.drain, Stream.concat(Stream.never));
                    })
                  : Stream.never,
            }),
            Effect.forkScoped,
          );
          expect((yield* watcher.takePending).work._tag).toBe("Full");
          expect(Watcher.isRefreshSuccessful(yield* watcher.refresh)).toBe(
            true,
          );
          yield* Deferred.succeed(fail, undefined);
          yield* Deferred.await(restored);
          expect((yield* watcher.takePending).work._tag).toBe("Full");
          expect((yield* watcher.takePending).work._tag).toBe("None");
          expect(subscriptions).toBe(2);
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
          let subscriptions = 0;
          const signal = yield* Queue.sliding<void>(1);
          const pending = yield* Ref.make(SyncState.empty);
          const watcher = yield* Watcher.make(signal, pending);
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
                  ? Stream.suspend(() => {
                      subscriptions++;
                      return subscriptions === 1
                        ? Stream.fail(error)
                        : Stream.fromEffect(
                            Deferred.succeed(restored, undefined),
                          ).pipe(Stream.drain, Stream.concat(Stream.never));
                    })
                  : fs.watch(directory, options),
            }),
          );
          if (recover) {
            const fiber = yield* running.pipe(Effect.forkScoped);
            yield* Deferred.await(restored).pipe(Effect.timeout("5 seconds"));
            yield* Fiber.interrupt(fiber);
            expect(subscriptions).toBe(2);
          } else {
            const result = yield* running.pipe(Effect.result);
            assert(Result.isFailure(result));
            expect(result.failure).toBe(error);
            expect(subscriptions).toBe(1);
          }
        }).pipe(Effect.scoped),
      { timeout: 15000 },
    );
  },
);
