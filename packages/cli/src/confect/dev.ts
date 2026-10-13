import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Crypto from "effect/Crypto";
import * as Hex from "effect/encoding/Hex";
import * as Command from "effect/cli/Command";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Duration from "effect/Duration";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
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
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import {
  externalPlugin,
  loadTsConfig,
  tsconfigPathsToRegExp,
} from "bundle-require";
import * as esbuild from "esbuild";
import * as Ansi from "../Ansi";
import * as Bundler from "../Bundler";
import * as WatchGraph from "../WatchGraph";
import * as WatchBuild from "../WatchBuild";
import * as DevState from "../DevState";
import type { EntryPoint, Pending } from "../DevState";
import * as CodegenError from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import { CONVEX_CONFIG_FILENAME } from "../ConvexConfig";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import type * as GroupPath from "../GroupPath";
import type * as GroupPaths from "../GroupPaths";
import { discoverLeafImplFiles, discoverLeafSpecFiles } from "../LeafModule";
import {
  logCoalescedBuildErrors,
  logCoalescedBuildWarnings,
  logFunctionAdded,
  logFunctionRemoved,
  logPending,
  logSuccess,
} from "../log";
import { ProjectRoot } from "../ProjectRoot";
import { discoverTableFiles } from "../TableModule";
import {
  generateAuthConfig,
  generateCrons,
  generateHttp,
  touchConvexSchema,
} from "../utils";
import {
  codegenHandler,
  loadPreviousFunctionPaths,
  validateImplFiles,
} from "./codegen";

const COALESCE_QUIESCENCE = Duration.millis(300);

// Upper bound on `drainUntilQuiescent` so a pathological infinite
// signal stream can't pin the sync loop forever.
const COALESCE_MAX_WAIT = Duration.seconds(5);

type WatcherLifecycle = Data.TaggedEnum<{
  Uninitialized: {};
  Empty: {};
  Active: {
    readonly key: string;
    readonly scope: Scope.Closeable;
    readonly entries: Array.NonEmptyReadonlyArray<EntryPoint>;
    readonly context: esbuild.BuildContext;
  };
}>;
const WatcherLifecycle = Data.taggedEnum<WatcherLifecycle>();

interface Watcher {
  readonly lifecycle: Ref.Ref<WatcherLifecycle>;
  readonly observation: Ref.Ref<WatchBuild.State>;
  readonly lock: Semaphore.Semaphore;
}

type RefreshOutcome = Data.TaggedEnum<{
  Empty: {};
  Observed: { readonly outcome: WatchBuild.Outcome };
}>;
const RefreshOutcome = Data.taggedEnum<RefreshOutcome>();

const changeChar = (change: "Added" | "Removed" | "Modified") =>
  Match.value(change).pipe(
    Match.when("Added", () => ({ char: "+", color: Ansi.green })),
    Match.when("Removed", () => ({ char: "-", color: Ansi.red })),
    Match.when("Modified", () => ({ char: "~", color: Ansi.magenta })),
    Match.exhaustive,
  );

const logFileChangeIndented = Effect.fnUntraced(function* (
  change: "Added" | "Removed" | "Modified",
  fullPath: string,
) {
  const projectRoot = yield* ProjectRoot.get;
  const path = yield* Path.Path;

  const prefix = projectRoot + path.sep;
  const suffix = pipe(fullPath, String.startsWith(prefix))
    ? pipe(fullPath, String.slice(prefix.length))
    : fullPath;

  const { char, color } = changeChar(change);

  yield* Console.log(
    `${color(char)} ${Ansi.blackBright(prefix)}${color(suffix)}`,
  );
});

const logFunctionPathDiff = Effect.fnUntraced(function* (
  previous: FunctionPaths.FunctionPaths,
  current: FunctionPaths.FunctionPaths,
) {
  const {
    functionsAdded,
    functionsRemoved,
    groupsRemoved,
    groupsAdded,
    groupsChanged,
  } = FunctionPaths.diff(previous, current);

  const logForGroups = (
    groupPaths: GroupPaths.GroupPaths,
    fnPaths: FunctionPaths.FunctionPaths,
    logFn: typeof logFunctionAdded,
  ) =>
    Effect.forEach(groupPaths, (gp) =>
      Effect.forEach(
        Array.fromIterable(
          HashSet.filter(fnPaths, (fp) => Equal.equals(fp.groupPath, gp)),
        ),
        logFn,
      ),
    );

  yield* logForGroups(groupsRemoved, functionsRemoved, logFunctionRemoved);
  yield* logForGroups(groupsAdded, functionsAdded, logFunctionAdded);
  yield* Effect.forEach(
    groupsChanged,
    Effect.fnUntraced(function* (gp: GroupPath.GroupPath) {
      yield* Effect.forEach(
        Array.fromIterable(
          HashSet.filter(functionsAdded, (fp) =>
            Equal.equals(fp.groupPath, gp),
          ),
        ),
        logFunctionAdded,
      );
      yield* Effect.forEach(
        Array.fromIterable(
          HashSet.filter(functionsRemoved, (fp) =>
            Equal.equals(fp.groupPath, gp),
          ),
        ),
        logFunctionRemoved,
      );
    }),
  );
});

export const dev = Command.make("dev", {}, () =>
  Effect.gen(function* () {
    yield* logPending("Performing initial sync…");
    const previousFunctionPaths = yield* loadPreviousFunctionPaths;

    const pendingRef = yield* Ref.make<Pending>(DevState.empty);
    const signal = yield* Queue.sliding<void>(1);
    const restartQueue = yield* Queue.sliding<void>(1);
    const watcher: Watcher = {
      lifecycle: yield* Ref.make<WatcherLifecycle>(
        WatcherLifecycle.Uninitialized(),
      ),
      observation: yield* Ref.make<WatchBuild.State>(
        WatchBuild.State.Initial(),
      ),
      lock: yield* Semaphore.make(1),
    };

    yield* Effect.all(
      [
        Effect.scoped(
          entryPointsWatcher(signal, pendingRef, restartQueue, watcher),
        ),
        confectStructureWatcher(signal, pendingRef, restartQueue),
        convexConfigStructureWatcher(restartQueue),
        syncLoop(signal, pendingRef, previousFunctionPaths, watcher),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const esbuildMessageKey = (m: esbuild.Message): string =>
  `${m.location?.file ?? ""}:${m.location?.line ?? ""}:${m.location?.column ?? ""}:${m.text}`;

const dedupeWatcherMessages = (
  messages: ReadonlyArray<esbuild.Message>,
): ReadonlyArray<esbuild.Message> =>
  pipe(
    messages,
    Array.dedupeWith(
      (messageA, messageB) =>
        esbuildMessageKey(messageA) === esbuildMessageKey(messageB),
    ),
  );

const watcherMessagesSignature = (
  messages: ReadonlyArray<esbuild.Message>,
): string =>
  pipe(
    messages,
    Array.map(esbuildMessageKey),
    Array.dedupe,
    Array.sort(Order.String),
    Array.join("\n"),
  );

/**
 * Log any watcher messages (errors or warnings) that haven't already been
 * logged at their current signature. Suppresses the per-watcher fanout that
 * happens when one root cause (e.g. a missing import) breaks every entry
 * point's build at the same source location.
 */
const logChangedWatcherMessages = Effect.fnUntraced(function* (
  messages: ReadonlyArray<esbuild.Message>,
  lastLoggedSignatureRef: Ref.Ref<string>,
  log: (messages: ReadonlyArray<esbuild.Message>) => Effect.Effect<void>,
) {
  const signature = watcherMessagesSignature(messages);
  const previous = yield* Ref.get(lastLoggedSignatureRef);
  if (signature === previous) return;
  yield* Ref.set(lastLoggedSignatureRef, signature);
  if (messages.length === 0) return;
  yield* log(dedupeWatcherMessages(messages));
});

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

const syncLoop = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  initialFunctionPaths: FunctionPaths.FunctionPaths,
  watcher: Watcher,
) {
  const functionPathsRef = yield* Ref.make(initialFunctionPaths);
  const lastLoggedErrorsRef = yield* Ref.make<string>("");
  const lastLoggedWarningsRef = yield* Ref.make<string>("");
  const phaseRef = yield* Ref.make<DevState.Phase>(
    DevState.Phase.Bootstrapping(),
  );
  const optionalPendingRef = yield* Ref.make(
    HashSet.empty<DevState.OptionalFile>(),
  );
  const logMessages = Effect.gen(function* () {
    const state = yield* Ref.get(watcher.observation);
    const errors =
      state._tag === "Failed" ? WatchBuild.messages(state.observation) : [];
    const warnings = WatchBuild.State.$match(state, {
      Initial: () => [],
      Succeeded: (observation) => observation.warnings,
      Failed: ({ observation }) => observation.warnings,
    });
    yield* logChangedWatcherMessages(
      errors,
      lastLoggedErrorsRef,
      logCoalescedBuildErrors,
    );
    yield* logChangedWatcherMessages(
      warnings,
      lastLoggedWarningsRef,
      logCoalescedBuildWarnings,
    );
  });

  return yield* Effect.forever(
    Effect.gen(function* () {
      yield* Effect.logDebug("Running sync loop…");
      yield* Queue.take(signal);
      yield* drainUntilQuiescent(
        signal,
        COALESCE_QUIESCENCE,
        COALESCE_MAX_WAIT,
      );

      const phase = yield* Ref.get(phaseRef);
      const firstSync = phase._tag === "Bootstrapping";
      if (!firstSync) yield* logMessages;

      const pending = yield* Ref.getAndSet(pendingRef, DevState.empty);
      if (!DevState.isDirty(pending)) return;

      const optional = yield* Ref.updateAndGet(
        optionalPendingRef,
        HashSet.union(pending.optional),
      );
      if (!firstSync)
        yield* logPending("Dependencies may have changed, reloading…");

      if (DevState.requiresFullSync(phase, pending)) {
        const current = yield* codegenHandler.pipe(
          Effect.tap(({ functionPaths: nextFunctionPaths }) =>
            Effect.gen(function* () {
              const previous = yield* Ref.get(functionPathsRef);
              yield* logFunctionPathDiff(previous, nextFunctionPaths);
              yield* Ref.set(functionPathsRef, nextFunctionPaths);
            }),
          ),
          CodegenError.catchAndLog,
        );
        if (Option.isNone(current)) {
          yield* Ref.set(phaseRef, DevState.Phase.NeedsFullSync());
          if (firstSync) {
            yield* Ref.update(pendingRef, DevState.full);
            yield* Queue.offer(signal, undefined);
          }
          return;
        }
        const refreshed = yield* refreshWatcher(watcher).pipe(Effect.result);
        if (Result.isFailure(refreshed)) {
          yield* Console.error(
            `Dependency watcher could not ${refreshed.failure.operation}: ${globalThis.String(refreshed.failure.cause)}`,
          );
          yield* Ref.set(phaseRef, DevState.Phase.NeedsFullSync());
          return;
        }
        if (
          refreshed.success._tag === "Observed" &&
          refreshed.success.outcome._tag === "Failed"
        ) {
          yield* logMessages;
          yield* Ref.set(phaseRef, DevState.Phase.NeedsFullSync());
          return;
        }
        yield* Ref.set(
          phaseRef,
          DevState.Phase.Incremental({ failedImpls: HashSet.empty() }),
        );
      } else {
        const paths = DevState.implsToValidate(phase, pending);
        if (Array.isReadonlyArrayNonEmpty(paths)) {
          const validated = yield* validateImplFiles(paths).pipe(
            CodegenError.catchAndLog,
          );
          if (Option.isNone(validated)) {
            yield* Ref.set(
              phaseRef,
              DevState.Phase.Incremental({
                failedImpls: HashSet.fromIterable(paths),
              }),
            );
            return;
          }
          yield* Ref.set(
            phaseRef,
            DevState.Phase.Incremental({ failedImpls: HashSet.empty() }),
          );
          yield* touchConvexSchema;
        }
      }

      const dirtyOptionalFiles = [
        ...(HashSet.has(optional, "Http")
          ? [syncOptionalFile(generateHttp, "http.ts")]
          : []),
        ...(HashSet.has(optional, "Crons")
          ? [syncOptionalFile(generateCrons, "crons.ts")]
          : []),
        ...(HashSet.has(optional, "Auth")
          ? [syncOptionalFile(generateAuthConfig, "auth.config.ts")]
          : []),
      ];

      yield* Array.isReadonlyArrayNonEmpty(dirtyOptionalFiles)
        ? Effect.all(dirtyOptionalFiles, { concurrency: "unbounded" })
        : Effect.void;
      yield* Ref.set(optionalPendingRef, HashSet.empty());

      if (!DevState.isDirty(yield* Ref.get(pendingRef))) {
        yield* logSuccess("Generated files are up-to-date");
      }
    }),
  );
});

const discoverEntryPoints = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const tryEntry = Effect.fnUntraced(function* (
    kind: Exclude<DevState.EntryKind, { readonly _tag: "Config" }>,
  ) {
    const absolutePath = path.join(confectDirectory, kind.relativePath);
    if (!(yield* fs.exists(absolutePath))) {
      return Option.none<EntryPoint>();
    }
    return Option.some<EntryPoint>({
      ...kind,
      absolutePath,
      inputPath: yield* fs
        .realPath(absolutePath)
        .pipe(Effect.orElseSucceed(() => absolutePath)),
    });
  });

  const fixedEntryOptions = yield* Effect.all([
    tryEntry(DevState.EntryKind.Http({ relativePath: "http.ts" })),
    tryEntry(DevState.EntryKind.Crons({ relativePath: "crons.ts" })),
    tryEntry(DevState.EntryKind.Auth({ relativePath: "auth.ts" })),
  ]);

  const moduleRelativePaths = yield* Effect.all([
    discoverLeafSpecFiles,
    discoverLeafImplFiles,
    discoverTableFiles,
  ]).pipe(Effect.map(Array.flatten));
  const moduleEntryOptions = yield* Effect.forEach(
    Array.getSomes(moduleRelativePaths.map(DevState.parseEntry)),
    tryEntry,
  );

  // `convex/convex.config.ts` feeds the generated components registry, so
  // edits to it (or to a locally-defined component definition it imports—npm component definitions are externalized and not watched) must re-run
  // codegen.
  const convexDirectory = yield* ConvexDirectory.get;
  const convexConfigEntryOption = yield* Effect.gen(function* () {
    const absolutePath = path.join(convexDirectory, CONVEX_CONFIG_FILENAME);
    if (!(yield* fs.exists(absolutePath))) {
      return Option.none<EntryPoint>();
    }
    return Option.some<EntryPoint>({
      ...DevState.EntryKind.Config(),
      absolutePath,
      inputPath: yield* fs
        .realPath(absolutePath)
        .pipe(Effect.orElseSucceed(() => absolutePath)),
    });
  });

  return Array.getSomes([
    ...fixedEntryOptions,
    convexConfigEntryOption,
    ...moduleEntryOptions,
  ]);
});

const esbuildOptions = (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  projectRoot: string,
  generatedDirectory: string,
  entries: ReadonlyArray<EntryPoint>,
  notExternal: ReadonlyArray<RegExp>,
  stateRef: Ref.Ref<WatchBuild.State>,
  captureRef: Ref.Ref<WatchBuild.Capture>,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
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
              Ref.set(captureRef, WatchBuild.emptyCapture).pipe(
                Effect.as(undefined),
              ),
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
                const previous = yield* Ref.get(stateRef);
                const outcome = yield* WatchBuild.parse(
                  result,
                  yield* Ref.get(captureRef),
                  (file) => path.resolve(projectRoot, file),
                  crypto,
                );
                const current = WatchBuild.observe(previous, outcome);
                yield* Ref.set(stateRef, current);
                const previousFingerprints = WatchBuild.fingerprints(previous);
                const fingerprints = WatchBuild.fingerprints(current);
                const graph = Option.match(WatchBuild.lastSuccessful(current), {
                  onNone: () =>
                    HashMap.empty<string, HashSet.HashSet<string>>(),
                  onSome: (snapshot) => snapshot.graph,
                });
                const previousGraph = Option.match(
                  WatchBuild.lastSuccessful(previous),
                  {
                    onNone: () =>
                      HashMap.empty<string, HashSet.HashSet<string>>(),
                    onSome: (snapshot) => snapshot.graph,
                  },
                );
                const files = HashSet.union(
                  HashSet.fromIterable(HashMap.keys(previousFingerprints)),
                  HashSet.fromIterable(HashMap.keys(fingerprints)),
                );
                const changed = Array.fromIterable(files).filter(
                  (file) =>
                    !Equal.equals(
                      HashMap.get(previousFingerprints, file),
                      HashMap.get(fingerprints, file),
                    ),
                );
                const sources = changed.filter(
                  (file) => !file.startsWith(generatedDirectory + path.sep),
                );
                const affected = HashSet.union(
                  WatchGraph.affected(graph, sources),
                  WatchGraph.affected(previousGraph, sources),
                );
                const unknownChange =
                  changed.length === 0 &&
                  !Equal.equals(
                    WatchBuild.outputHash(previous),
                    WatchBuild.outputHash(current),
                  );
                const full =
                  previous._tag === "Initial" ||
                  (sources.length > 0 && outcome._tag === "Failed") ||
                  unknownChange;
                const dirtyEntries = full
                  ? entries
                  : entries.filter((entry) =>
                      HashSet.has(affected, entry.inputPath),
                    );
                yield* Ref.update(pendingRef, (pending) =>
                  DevState.add(pending, dirtyEntries, full),
                );
                yield* Queue.offer(signal, undefined);
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
  watcher: Watcher,
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

  const sync = Effect.gen(function* () {
    const current = yield* Ref.get(watcher.lifecycle);
    const entries = yield* discoverEntryPoints;
    const desiredPaths = HashSet.fromIterable(
      entries.map((entry) => entry.absolutePath),
    );
    const key = pipe(
      Array.fromIterable(desiredPaths),
      Array.sort(Order.String),
      Array.join("\n"),
    );
    if (
      (current._tag === "Active" && current.key === key) ||
      (current._tag === "Empty" && entries.length === 0)
    )
      return;
    const structuralChange = current._tag !== "Uninitialized";
    if (structuralChange) yield* Ref.update(pendingRef, DevState.full);
    const removedOptional =
      current._tag === "Active"
        ? current.entries.filter(
            (entry) =>
              (entry._tag === "Http" ||
                entry._tag === "Crons" ||
                entry._tag === "Auth") &&
              !HashSet.has(desiredPaths, entry.absolutePath),
          )
        : [];
    yield* Ref.update(pendingRef, (pending) =>
      DevState.add(pending, removedOptional),
    );
    if (current._tag === "Active") yield* Scope.close(current.scope, Exit.void);
    yield* Ref.set(watcher.lifecycle, WatcherLifecycle.Uninitialized());
    yield* Ref.set(watcher.observation, WatchBuild.State.Initial());
    if (!Array.isReadonlyArrayNonEmpty(entries)) {
      yield* Ref.set(watcher.lifecycle, WatcherLifecycle.Empty());
      yield* Ref.update(pendingRef, DevState.full);
      yield* Queue.offer(signal, undefined);
      return;
    }

    const scope = yield* Scope.fork(parentScope, "sequential");
    const captureRef = yield* Ref.make(WatchBuild.emptyCapture);
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
              signal,
              pendingRef,
            ),
          ),
        catch: (cause) =>
          new WatchBuild.OperationError({ operation: "create", cause }),
      }),
      (ctx) =>
        Effect.tryPromise({
          try: () => ctx.dispose(),
          catch: (cause) =>
            new WatchBuild.OperationError({ operation: "dispose", cause }),
        }).pipe(Effect.orDie),
    ).pipe(Scope.provide(scope));
    yield* Ref.set(
      watcher.lifecycle,
      WatcherLifecycle.Active({ key, scope, entries, context }),
    );
    yield* Effect.tryPromise({
      try: () => context.watch(),
      catch: (cause) =>
        new WatchBuild.OperationError({ operation: "watch", cause }),
    });
  }).pipe(Semaphore.withPermit(watcher.lock));

  yield* sync;
  return yield* Effect.forever(
    Queue.take(restartQueue).pipe(Effect.andThen(sync)),
  );
}, Effect.provide(NodeCrypto.layer));

const refreshWatcher = Effect.fnUntraced(function* (watcher: Watcher) {
  return yield* watcher.lock.withPermit(
    Effect.gen(function* () {
      const current = yield* Ref.get(watcher.lifecycle);
      if (current._tag === "Empty") return RefreshOutcome.Empty();
      if (current._tag === "Uninitialized")
        return yield* new WatchBuild.OperationError({
          operation: "refresh",
          cause: "The dependency watcher is not initialized",
        });
      const rebuild = Effect.gen(function* () {
        const built = yield* Effect.tryPromise({
          try: () => current.context.rebuild(),
          catch: (cause) =>
            new WatchBuild.OperationError({ operation: "rebuild", cause }),
        }).pipe(Effect.result);
        const state = yield* Ref.get(watcher.observation);
        if (Result.isFailure(built)) {
          const rejected = WatchBuild.parseFailure(built.failure.cause);
          if (Option.isNone(rejected)) return yield* built.failure;
          if (state._tag !== "Failed")
            return yield* new WatchBuild.OperationError({
              operation: "rebuild",
              cause: rejected.value.errors,
            });
        }
        if (state._tag === "Succeeded")
          return WatchBuild.Outcome.Succeeded({
            snapshot: state.snapshot,
            warnings: state.warnings,
          });
        if (state._tag === "Failed") return state.observation;
        return yield* new WatchBuild.OperationError({
          operation: "rebuild",
          cause: "esbuild completed without a build observation",
        });
      });
      yield* rebuild;
      return RefreshOutcome.Observed({ outcome: yield* rebuild });
    }),
  );
});

const confectStructureWatcher = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  restartQueue: Queue.Queue<void>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

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
        restartQueue,
      }),
    ),
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
  restartQueue: Queue.Queue<void>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;

  yield* pipe(
    fs.watch(convexDirectory),
    Stream.runForEach((event) =>
      path.relative(convexDirectory, event.path) === CONVEX_CONFIG_FILENAME &&
      event._tag !== "Update"
        ? Queue.offer(restartQueue, undefined)
        : Effect.void,
    ),
  );
});

const flipDirtyAndSignal = (
  pendingRef: Ref.Ref<Pending>,
  signal: Queue.Queue<void>,
  restartQueue: Queue.Queue<void>,
  restart: boolean,
) =>
  pipe(
    Ref.update(pendingRef, DevState.full),
    Effect.andThen(Queue.offer(signal, undefined)),
    Effect.andThen(
      restart ? Queue.offer(restartQueue, undefined) : Effect.void,
    ),
  );

const handleConfectChange = ({
  relativePath,
  eventTag,
  signal,
  pendingRef,
  restartQueue,
}: {
  relativePath: string;
  eventTag: "Create" | "Update" | "Remove";
  signal: Queue.Queue<void>;
  pendingRef: Ref.Ref<Pending>;
  restartQueue: Queue.Queue<void>;
}) => {
  if (relativePath.split(/[/\\]/).includes("_generated")) {
    return Effect.void;
  }

  if (!relativePath.endsWith(".ts")) {
    return Effect.void;
  }

  const isLifecycleChange = eventTag !== "Update";

  if (Option.isSome(DevState.parseEntry(relativePath))) {
    return isLifecycleChange
      ? Queue.offer(restartQueue, undefined)
      : Effect.void;
  }

  // A stray `confect/schema.ts` (now codegen-owned at
  // `_generated/schema.ts`) shouldn't exist; flagging it here ensures the
  // next codegen pass surfaces the migration error
  // (`LegacySchemaFileError`) instead of silently ignoring the file.
  if (relativePath === "schema.ts") {
    return flipDirtyAndSignal(
      pendingRef,
      signal,
      restartQueue,
      isLifecycleChange,
    );
  }

  // Any other `.ts` under `confect/` (helpers like `tables/notes.ts`).
  // Updates to such files are handled by the esbuild watcher for whichever
  // entry point imports them—its onEnd flips the right dirty flag.
  // Creates are our safety net: when a previously-missing import is added,
  // esbuild may not have its parent directory on a poll path, so we
  // re-run codegen on Create here.
  if (eventTag === "Create") {
    return flipDirtyAndSignal(pendingRef, signal, restartQueue, false);
  }

  return Effect.void;
};

const syncOptionalFile = (generate: typeof generateHttp, convexFile: string) =>
  pipe(
    generate,
    Effect.andThen(
      Option.match({
        onSome: ({ change, convexFilePath }) =>
          Match.value(change).pipe(
            Match.when("Unchanged", () => Effect.void),
            Match.whenOr("Added", "Modified", (addedOrModified) =>
              logFileChangeIndented(addedOrModified, convexFilePath),
            ),
            Match.exhaustive,
          ),
        onNone: () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const convexDirectory = yield* ConvexDirectory.get;
            const convexFilePath = path.join(convexDirectory, convexFile);

            if (yield* fs.exists(convexFilePath)) {
              yield* fs.remove(convexFilePath);
              yield* logFileChangeIndented("Removed", convexFilePath);
            }
          }),
      }),
    ),
  );
