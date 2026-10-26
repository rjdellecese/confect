import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HashSet from "effect/HashSet";
import * as HashMap from "effect/HashMap";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Semaphore from "effect/Semaphore";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import {
  externalPlugin,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import * as esbuild from "esbuild";
import * as Bundler from "./Bundler";
import * as WatchBuild from "./WatchBuild";
import * as WatchTopology from "./WatchTopology";
import * as SyncState from "./SyncState";
import type { Pending } from "./SyncState";
import * as EntryPoint from "./EntryPoint";
import type { EntryPoint as Entry } from "./EntryPoint";
import { ConfectDirectory } from "./ConfectDirectory";
import { CONVEX_CONFIG_FILENAME } from "./ConvexConfig";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";

const COALESCE_QUIESCENCE = Duration.millis(300);

// Upper bound on `drainUntilQuiescent` so a pathological infinite
// signal stream can't pin the sync loop forever.
const COALESCE_MAX_WAIT = Duration.seconds(5);

type WatcherLifecycle = Data.TaggedEnum<{
  Uninitialized: {};
  Empty: {};
  Active: {
    readonly initial: Deferred.Deferred<void>;
    readonly key: string;
    readonly scope: Scope.Closeable;
    readonly entries: Array.NonEmptyReadonlyArray<Entry>;
    readonly context: esbuild.BuildContext;
    readonly identifyRequest: (
      promise: Promise<esbuild.BuildResult>,
    ) => WatchBuild.RequestId;
    readonly progress: Ref.Ref<WatchBuild.Progress>;
    readonly verifyInputs: (
      snapshot: WatchBuild.Snapshot,
    ) => ReturnType<typeof WatchBuild.verifyInputs>;
  };
}>;
const WatcherLifecycle = Data.taggedEnum<WatcherLifecycle>();

interface State {
  readonly lifecycle: Ref.Ref<WatcherLifecycle>;
  readonly observation: Ref.Ref<WatchBuild.State>;
  readonly lock: Semaphore.Semaphore;
  readonly topology: WatchTopology.WatchTopology;
}

type RefreshOutcome = Data.TaggedEnum<{
  Empty: {};
  Observed: { readonly outcome: WatchBuild.Outcome };
}>;
const RefreshOutcome = Data.taggedEnum<RefreshOutcome>();

export const isRefreshSuccessful = (outcome: RefreshOutcome): boolean =>
  RefreshOutcome.$match(outcome, {
    Empty: () => true,
    Observed: ({ outcome: observed }) =>
      WatchBuild.Outcome.$match(observed, {
        Succeeded: () => true,
        Failed: () => false,
      }),
  });

export class OperationError extends Schema.TaggedError<OperationError>()(
  "WatcherOperationError",
  {
    operation: Schema.Literals([
      "create",
      "watch",
      "rebuild",
      "dispose",
      "refresh",
    ]),
    cause: Schema.Unknown,
  },
) {}

const ReportedBuildFailure = Schema.Struct({
  errors: Schema.NonEmptyArray(Schema.Struct({ text: Schema.String })),
});
export const parseFailure = Schema.decodeUnknownOption(ReportedBuildFailure);

export const make = Effect.fnUntraced(function* () {
  const signal = yield* Queue.sliding<void>(1);
  const pendingRef = yield* Ref.make<Pending>(SyncState.empty);
  const restartQueue = yield* Queue.sliding<void>(1);
  const state: State = {
    lifecycle: yield* Ref.make<WatcherLifecycle>(
      WatcherLifecycle.Uninitialized(),
    ),
    observation: yield* Ref.make<WatchBuild.State>(WatchBuild.State.Initial()),
    lock: yield* Semaphore.make(1),
    topology: yield* WatchTopology.make(pendingRef),
  };
  const restartWith = (invalidation: Effect.Effect<void>) =>
    invalidation.pipe(
      Effect.andThen(Queue.offer(restartQueue, undefined)),
      Effect.andThen(Queue.offer(signal, undefined)),
    );
  const restart = restartWith(state.topology.invalidate);
  const restartEntry = (entry: EntryPoint.Kind) =>
    restartWith(state.topology.invalidateEntry(entry));
  return {
    run: Effect.all(
      [
        Effect.scoped(
          entryPointsWatcher(signal, pendingRef, restartQueue, state),
        ),
        confectStructureWatcher(signal, pendingRef, restart, restartEntry),
        convexConfigStructureWatcher(restart),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.asVoid),
    refresh: refresh(state),
    next: Queue.take(signal).pipe(
      Effect.andThen(
        drainUntilQuiescent(signal, COALESCE_QUIESCENCE, COALESCE_MAX_WAIT),
      ),
      Effect.andThen(state.topology.takePending),
      Effect.onInterrupt(() => Queue.offer(signal, undefined)),
    ),
    pending: Ref.get(pendingRef),
    requestRetry: Ref.update(pendingRef, SyncState.full).pipe(
      Effect.andThen(Queue.offer(signal, undefined)),
      Effect.asVoid,
    ),
    diagnostics: Ref.get(state.observation).pipe(
      Effect.map(WatchBuild.diagnostics),
    ),
  } as const;
});

export type Watcher = Effect.Success<ReturnType<typeof make>>;

const drainUntilQuiescent = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  quiescence: Duration.Duration,
  maxWait: Duration.Duration,
) {
  const start = yield* Clock.currentTimeMillis;
  const maxMillis = Duration.toMillis(maxWait);
  const loop: Effect.Effect<void> = Effect.gen(function* () {
    yield* Effect.sleep(quiescence);
    const drained = yield* Queue.clear(signal);
    if (drained.length === 0) return;
    const now = yield* Clock.currentTimeMillis;
    if (now - start < maxMillis) {
      yield* loop;
    }
  });
  yield* loop;
});

const esbuildOptions = (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  projectRoot: string,
  generatedDirectory: string,
  entries: ReadonlyArray<Entry>,
  notExternal: ReadonlyArray<RegExp>,
  stateRef: Ref.Ref<WatchBuild.State>,
  captureRef: Ref.Ref<WatchBuild.Capture>,
  progressRef: Ref.Ref<WatchBuild.Progress>,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  initial: Deferred.Deferred<void>,
): esbuild.BuildOptions => {
  const encodeString = Schema.encodeSync(Schema.fromJsonString(Schema.String));
  return {
    absWorkingDir: projectRoot,
    stdin: {
      contents: entries
        .map((entry) => `import ${encodeString(entry.absolutePath)};`)
        .join("\n"),
      resolveDir: projectRoot,
      sourcefile: "confect-watch.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
    plugins: [
      Bundler.bundleWorkspacePlugin(path, fs, notExternal),
      externalPlugin({ notExternal: [...notExternal] }),
      {
        name: "notify-rebuild",
        setup(build) {
          build.onStart(() =>
            Effect.runPromise(
              Effect.gen(function* () {
                yield* Ref.update(progressRef, WatchBuild.start);
                yield* Ref.set(captureRef, WatchBuild.emptyCapture);
              }).pipe(Effect.as(undefined)),
            ),
          );
          build.onLoad({ filter: /.*/ }, (args) =>
            Effect.runPromise(
              Effect.gen(function* () {
                const fingerprint = yield* fs.readFile(args.path).pipe(
                  Effect.flatMap((contents) =>
                    crypto.digest("SHA-256", contents),
                  ),
                  Effect.map(Hex.encode),
                  Effect.result,
                );
                yield* Ref.update(captureRef, (capture) =>
                  Result.isSuccess(fingerprint)
                    ? {
                        ...capture,
                        fingerprints: HashMap.set(
                          capture.fingerprints,
                          args.path,
                          fingerprint.success,
                        ),
                      }
                    : {
                        ...capture,
                        failures: HashMap.set(
                          capture.failures,
                          args.path,
                          WatchBuild.Failure.InputCaptureFailed({
                            file: args.path,
                            cause: fingerprint.failure,
                          }),
                        ),
                      },
                );
              }).pipe(Effect.as(undefined)),
            ),
          );
          build.onEnd((result) =>
            Effect.runPromise(
              Effect.gen(function* () {
                const { generation } = yield* Ref.get(progressRef);
                const previous = yield* Ref.get(stateRef);
                const outcome = yield* WatchBuild.parse(
                  result,
                  yield* Ref.get(captureRef),
                  (file) => path.resolve(projectRoot, file),
                  crypto,
                );
                const current = WatchBuild.observe(previous, outcome);
                yield* Ref.set(stateRef, current);
                const change = WatchBuild.diff(
                  previous,
                  current,
                  generatedDirectory + path.sep,
                );
                yield* Ref.update(pendingRef, (pending) =>
                  WatchBuild.Change.$match(change, {
                    Full: () => SyncState.add(pending, entries, true),
                    Affected: ({ paths }) =>
                      SyncState.add(
                        pending,
                        entries.filter((entry) =>
                          HashSet.has(paths, entry.inputPath),
                        ),
                      ),
                    Recovered: ({ paths }) =>
                      SyncState.reconcile(
                        SyncState.add(
                          pending,
                          entries.filter((entry) =>
                            HashSet.has(paths, entry.inputPath),
                          ),
                        ),
                      ),
                  }),
                );
                yield* Queue.offer(signal, undefined);
                yield* Ref.update(progressRef, (progress) =>
                  WatchBuild.complete(progress, { generation, outcome }),
                );
                yield* Deferred.succeed(initial, undefined);
              }),
            ),
          );
        },
      },
    ],
  };
};

const entryPointsWatcher = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  restartQueue: Queue.Queue<void>,
  watcher: State,
) {
  const parentScope = yield* Effect.scope;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const projectRoot = yield* ProjectRoot.get;
  const confectDirectory = yield* ConfectDirectory.get;
  const generatedDirectory = path.join(
    yield* fs.realPath(confectDirectory),
    "_generated",
  );
  const crypto = yield* Crypto.Crypto;
  const completedInitial = Deferred.make<void>().pipe(
    Effect.tap((initial) => Deferred.succeed(initial, undefined)),
  );

  const sync = Effect.gen(function* () {
    const revision = yield* watcher.topology.revision;
    const current = yield* Ref.get(watcher.lifecycle);
    const entries = yield* EntryPoint.discover;
    const desiredPaths = HashSet.fromIterable(
      entries.map((entry) => entry.absolutePath),
    );
    const key = pipe(
      Array.fromIterable(desiredPaths),
      Array.sort(Order.String),
      Array.join("\n"),
    );
    const unchanged = WatcherLifecycle.$match(current, {
      Uninitialized: () => false,
      Empty: () => entries.length === 0,
      Active: ({ key: previousKey }) => previousKey === key,
    });
    if (unchanged) {
      const initial = yield* WatcherLifecycle.$match(current, {
        Uninitialized: () => completedInitial,
        Empty: () => completedInitial,
        Active: ({ initial: activeInitial }) => Effect.succeed(activeInitial),
      });
      yield* watcher.topology.reconcile(revision, initial);
      return;
    }
    yield* WatcherLifecycle.$match(current, {
      Uninitialized: () => Effect.void,
      Empty: () => Ref.update(pendingRef, SyncState.full),
      Active: ({ entries: previousEntries, scope }) =>
        Effect.gen(function* () {
          const removedOptional = previousEntries.filter(
            (entry) =>
              EntryPoint.isOptional(entry) &&
              !HashSet.has(desiredPaths, entry.absolutePath),
          );
          yield* Ref.update(pendingRef, (pending) =>
            SyncState.add(SyncState.full(pending), removedOptional),
          );
          yield* Scope.close(scope, Exit.void);
        }),
    });
    yield* Ref.set(watcher.lifecycle, WatcherLifecycle.Uninitialized());
    yield* Ref.set(watcher.observation, WatchBuild.State.Initial());
    if (!Array.isReadonlyArrayNonEmpty(entries)) {
      yield* Ref.set(watcher.lifecycle, WatcherLifecycle.Empty());
      yield* Ref.update(pendingRef, SyncState.full);
      yield* Queue.offer(signal, undefined);
      const initial = yield* completedInitial;
      yield* watcher.topology.reconcile(revision, initial);
      return;
    }

    const scope = yield* Scope.fork(parentScope, "sequential");
    const captureRef = yield* Ref.make(WatchBuild.emptyCapture);
    const progress = yield* Ref.make(WatchBuild.initialProgress);
    const initial = yield* Deferred.make<void>();
    const tsconfig = loadTsConfig(projectRoot);
    const notExternal = tsconfigPathsToRegExp(
      tsconfig?.data.compilerOptions?.paths ?? {},
    );
    const context = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          esbuild.context(
            esbuildOptions(
              path,
              fs,
              crypto,
              projectRoot,
              generatedDirectory,
              entries,
              notExternal,
              watcher.observation,
              captureRef,
              progress,
              signal,
              pendingRef,
              initial,
            ),
          ),
        catch: (cause) => new OperationError({ operation: "create", cause }),
      }),
      (ctx) =>
        Effect.tryPromise({
          try: () => ctx.dispose(),
          catch: (cause) => new OperationError({ operation: "dispose", cause }),
        }).pipe(Effect.orDie),
    ).pipe(Scope.provide(scope));
    const requestIds = new WeakMap<
      Promise<esbuild.BuildResult>,
      WatchBuild.RequestId
    >();
    yield* Ref.set(
      watcher.lifecycle,
      WatcherLifecycle.Active({
        initial,
        key,
        scope,
        entries,
        context,
        identifyRequest: (promise) => {
          const existing = requestIds.get(promise);
          if (existing !== undefined) return existing;
          const id = WatchBuild.makeRequestId();
          requestIds.set(promise, id);
          return id;
        },
        progress,
        verifyInputs: (snapshot) =>
          WatchBuild.verifyInputs(snapshot, fs, crypto),
      }),
    );
    yield* Effect.tryPromise({
      try: () => context.watch(),
      catch: (cause) => new OperationError({ operation: "watch", cause }),
    });
    yield* watcher.topology.reconcile(revision, initial);
  }).pipe(Semaphore.withPermit(watcher.lock));

  yield* sync;
  return yield* Effect.forever(
    Queue.take(restartQueue).pipe(Effect.andThen(sync)),
  );
}, Effect.provide(NodeCrypto.layer));

const refresh = Effect.fnUntraced(function* (watcher: State) {
  return yield* watcher.lock.withPermit(
    Effect.gen(function* () {
      const current = yield* Ref.get(watcher.lifecycle);
      return yield* WatcherLifecycle.$match(current, {
        Empty: () => Effect.succeed(RefreshOutcome.Empty()),
        Uninitialized: () =>
          Effect.fail(
            new OperationError({
              operation: "refresh",
              cause: "The dependency watcher is not initialized",
            }),
          ),
        Active: ({ context, identifyRequest, progress, verifyInputs }) =>
          Effect.gen(function* () {
            const runSync = Effect.runSyncWith(yield* Effect.context());
            const barrier = WatchBuild.captureBarrier(yield* Ref.get(progress));
            const rebuild = Effect.gen(function* () {
              const built = yield* Effect.tryPromise({
                try: () => {
                  const promise = context.rebuild();
                  runSync(
                    Ref.update(progress, (currentProgress) =>
                      WatchBuild.request(
                        currentProgress,
                        identifyRequest(promise),
                      ),
                    ),
                  );
                  return promise;
                },
                catch: (cause) =>
                  new OperationError({ operation: "rebuild", cause }),
              }).pipe(Effect.result);
              const currentProgress = yield* Ref.get(progress);
              const completed = WatchBuild.getCompletion(currentProgress);
              if (Result.isFailure(built)) {
                const rejected = parseFailure(built.failure.cause);
                if (Option.isNone(rejected)) return yield* built.failure;
                if (WatchBuild.joinedWithoutCompletion(currentProgress))
                  return Option.none<WatchBuild.Completion>();
                if (
                  Option.isNone(completed) ||
                  !WatchBuild.Outcome.$is("Failed")(completed.value.outcome)
                )
                  return yield* new OperationError({
                    operation: "rebuild",
                    cause: rejected.value.errors,
                  });
              }
              if (WatchBuild.joinedWithoutCompletion(currentProgress))
                return Option.none<WatchBuild.Completion>();
              const observed = yield* Effect.fromOption(completed).pipe(
                Effect.mapError(
                  () =>
                    new OperationError({
                      operation: "rebuild",
                      cause: "esbuild completed without a build observation",
                    }),
                ),
              );
              if (
                WatchBuild.isFresh(barrier, observed) &&
                WatchBuild.Outcome.$is("Succeeded")(observed.outcome)
              ) {
                const unchanged = yield* verifyInputs(
                  observed.outcome.snapshot,
                ).pipe(
                  Effect.mapError(
                    ({ cause }) =>
                      new OperationError({ operation: "refresh", cause }),
                  ),
                );
                if (!unchanged) return Option.none<WatchBuild.Completion>();
              }
              return Option.some(observed);
            }).pipe(
              Effect.ensuring(Ref.update(progress, WatchBuild.endRequest)),
            );
            const completed = yield* rebuild.pipe(
              Effect.repeat({
                while: (observed) =>
                  Option.isNone(observed) ||
                  !WatchBuild.isFresh(barrier, observed.value),
              }),
              Effect.flatMap((observed) =>
                Effect.fromOption(observed).pipe(Effect.orDie),
              ),
            );
            return RefreshOutcome.Observed({ outcome: completed.outcome });
          }),
      });
    }),
  );
});

const confectStructureWatcher = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  restart: Effect.Effect<unknown>,
  restartEntry: (entry: EntryPoint.Kind) => Effect.Effect<unknown>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const removedDirectory = Schema.Struct({
    code: Schema.Literal("ENOENT"),
    syscall: Schema.Literal("scandir"),
    path: Schema.String,
  });

  yield* pipe(
    fs.watch(confectDirectory, { recursive: true }),
    Stream.runForEach((event) =>
      handleConfectChange({
        relativePath: path.relative(
          confectDirectory,
          path.resolve(confectDirectory, event.path),
        ),
        eventTag: event._tag,
        signal,
        pendingRef,
        restart,
        restartEntry,
      }),
    ),
    Effect.retry({
      schedule: Schedule.spaced("10 millis"),
      while: (error) =>
        Effect.gen(function* () {
          const removed = Schema.decodeUnknownOption(removedDirectory)(
            error.reason.cause,
          );
          if (Option.isNone(removed)) return false;
          const relative = path.relative(confectDirectory, removed.value.path);
          if (
            relative === "" ||
            relative === ".." ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
          )
            return false;
          if (
            !(yield* fs
              .exists(confectDirectory)
              .pipe(Effect.orElseSucceed(() => false)))
          ) {
            return false;
          }
          yield* restart;
          return true;
        }),
    }),
  );
});

/**
 * Non-recursive `fs.watch` on the convex directory, reacting only to
 * `convex.config.ts`. Recursion is deliberately avoided: codegen (Confect's and
 * Convex's) writes into `convex/` and `convex/_generated/` constantly, and
 * reacting to those writes would loop. Create/Remove offers to `restartQueue`
 * so the entry-point watcher set picks up (or drops) the config's esbuild
 * watcher.
 */
const convexConfigStructureWatcher = Effect.fnUntraced(function* (
  restart: Effect.Effect<unknown>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;

  yield* pipe(
    fs.watch(convexDirectory),
    Stream.runForEach((event) => {
      if (path.relative(convexDirectory, event.path) !== CONVEX_CONFIG_FILENAME)
        return Effect.void;
      return Match.value(event).pipe(
        Match.tag("Update", () => Effect.void),
        Match.tag("Create", "Remove", () => restart),
        Match.exhaustive,
      );
    }),
  );
});

const flipDirtyAndSignal = (
  pendingRef: Ref.Ref<Pending>,
  signal: Queue.Queue<void>,
  restart: Effect.Effect<unknown>,
  isLifecycleChange: boolean,
) =>
  isLifecycleChange
    ? restart
    : Ref.update(pendingRef, SyncState.full).pipe(
        Effect.andThen(Queue.offer(signal, undefined)),
      );

const handleConfectChange = ({
  relativePath,
  eventTag,
  signal,
  pendingRef,
  restart,
  restartEntry,
}: {
  relativePath: string;
  eventTag: "Create" | "Update" | "Remove";
  signal: Queue.Queue<void>;
  pendingRef: Ref.Ref<Pending>;
  restart: Effect.Effect<unknown>;
  restartEntry: (entry: EntryPoint.Kind) => Effect.Effect<unknown>;
}) => {
  if (relativePath.split(/[/\\]/).includes("_generated")) {
    return Effect.void;
  }

  if (!relativePath.endsWith(".ts")) {
    return Effect.void;
  }

  const isLifecycleChange = Match.value(eventTag).pipe(
    Match.when("Update", () => false),
    Match.whenOr("Create", "Remove", () => true),
    Match.exhaustive,
  );

  const entry = EntryPoint.parse(relativePath);
  if (Option.isSome(entry)) {
    return isLifecycleChange ? restartEntry(entry.value) : Effect.void;
  }

  // A stray `confect/schema.ts` (now codegen-owned at
  // `_generated/schema.ts`) shouldn't exist; flagging it here ensures the
  // next codegen pass surfaces the migration error
  // (`LegacySchemaFileError`) instead of silently ignoring the file.
  if (relativePath === "schema.ts") {
    return flipDirtyAndSignal(pendingRef, signal, restart, isLifecycleChange);
  }

  // Any other `.ts` under `confect/` (helpers like `tables/notes.ts`).
  // Updates to such files are handled by the esbuild watcher for whichever
  // entry point imports them—its onEnd flips the right dirty flag.
  // Creates are our safety net: when a previously-missing import is added,
  // esbuild may not have its parent directory on a poll path, so we
  // re-run codegen on Create here.
  return Match.value(eventTag).pipe(
    Match.when("Create", () =>
      flipDirtyAndSignal(pendingRef, signal, restart, false),
    ),
    Match.whenOr("Update", "Remove", () => Effect.void),
    Match.exhaustive,
  );
};
