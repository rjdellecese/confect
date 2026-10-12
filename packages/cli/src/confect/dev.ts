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
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Exit from "effect/Exit";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
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
import * as CodegenError from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import { CONVEX_CONFIG_FILENAME } from "../ConvexConfig";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import type * as GroupPath from "../GroupPath";
import type * as GroupPaths from "../GroupPaths";
import {
  discoverLeafImplFiles,
  discoverLeafSpecFiles,
  isLeafImplPath,
  isLeafSpecPath,
} from "../LeafModule";
import {
  logCoalescedBuildErrors,
  logCoalescedBuildWarnings,
  logFunctionAdded,
  logFunctionRemoved,
  logPending,
  logSuccess,
} from "../log";
import { ProjectRoot } from "../ProjectRoot";
import { discoverTableFiles, TABLES_DIRNAME } from "../TableModule";
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

type Pending = {
  readonly specDirty: boolean;
  readonly httpDirty: boolean;
  readonly cronsDirty: boolean;
  readonly authDirty: boolean;
  readonly implPaths: ReadonlySet<string>;
};

type PendingKey = Exclude<keyof Pending, "implPaths">;

const pendingInit: Pending = {
  specDirty: false,
  httpDirty: false,
  cronsDirty: false,
  authDirty: false,
  implPaths: new Set(),
};

const isPendingDirty = (p: Pending): boolean =>
  p.specDirty ||
  p.httpDirty ||
  p.cronsDirty ||
  p.authDirty ||
  p.implPaths.size > 0;

type WatcherMessages = ReadonlyMap<string, readonly esbuild.Message[]>;

const emptyWatcherMessages: WatcherMessages = new Map();

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

    const pendingRef = yield* Ref.make<Pending>(pendingInit);
    const signal = yield* Queue.sliding<void>(1);
    const restartQueue = yield* Queue.sliding<void>(1);
    const refreshWatcher = yield* Ref.make<Effect.Effect<void>>(Effect.void);
    const watcherErrorsRef =
      yield* Ref.make<WatcherMessages>(emptyWatcherMessages);
    const watcherWarningsRef =
      yield* Ref.make<WatcherMessages>(emptyWatcherMessages);

    yield* Effect.all(
      [
        Effect.scoped(
          entryPointsWatcher(
            signal,
            pendingRef,
            restartQueue,
            refreshWatcher,
            watcherErrorsRef,
            watcherWarningsRef,
          ),
        ),
        confectStructureWatcher(signal, pendingRef, restartQueue),
        convexConfigStructureWatcher(restartQueue),
        syncLoop(
          signal,
          pendingRef,
          previousFunctionPaths,
          refreshWatcher,
          watcherErrorsRef,
          watcherWarningsRef,
        ),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const esbuildMessageKey = (m: esbuild.Message): string =>
  `${m.location?.file ?? ""}:${m.location?.line ?? ""}:${m.location?.column ?? ""}:${m.text}`;

const allMessages = (
  messages: WatcherMessages,
): ReadonlyArray<esbuild.Message> =>
  pipe(Array.fromIterable(messages.values()), Array.flatten);

const dedupeWatcherMessages = (
  messages: WatcherMessages,
): ReadonlyArray<esbuild.Message> =>
  pipe(
    allMessages(messages),
    Array.dedupeWith(
      (messageA, messageB) =>
        esbuildMessageKey(messageA) === esbuildMessageKey(messageB),
    ),
  );

const watcherMessagesSignature = (messages: WatcherMessages): string =>
  pipe(
    allMessages(messages),
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
  messagesRef: Ref.Ref<WatcherMessages>,
  lastLoggedSignatureRef: Ref.Ref<string>,
  log: (messages: ReadonlyArray<esbuild.Message>) => Effect.Effect<void>,
) {
  const messages = yield* Ref.get(messagesRef);
  const signature = watcherMessagesSignature(messages);
  const previous = yield* Ref.get(lastLoggedSignatureRef);
  if (signature === previous) return;
  yield* Ref.set(lastLoggedSignatureRef, signature);
  if (messages.size === 0) return;
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
  refreshWatcher: Ref.Ref<Effect.Effect<void>>,
  watcherErrorsRef: Ref.Ref<WatcherMessages>,
  watcherWarningsRef: Ref.Ref<WatcherMessages>,
) {
  const functionPathsRef = yield* Ref.make(initialFunctionPaths);
  const lastLoggedErrorsRef = yield* Ref.make<string>("");
  const lastLoggedWarningsRef = yield* Ref.make<string>("");
  const fullSyncNeeded = yield* Ref.make(true);
  const initialSync = yield* Ref.make(true);
  const failedImpls = yield* Ref.make<ReadonlySet<string>>(new Set());
  const emptyOptional = {
    httpDirty: false,
    cronsDirty: false,
    authDirty: false,
  };
  const optionalPendingRef = yield* Ref.make(emptyOptional);

  return yield* Effect.forever(
    Effect.gen(function* () {
      yield* Effect.logDebug("Running sync loop…");
      yield* Queue.take(signal);
      yield* drainUntilQuiescent(
        signal,
        COALESCE_QUIESCENCE,
        COALESCE_MAX_WAIT,
      );

      if (!(yield* Ref.get(initialSync))) {
        yield* logChangedWatcherMessages(
          watcherErrorsRef,
          lastLoggedErrorsRef,
          logCoalescedBuildErrors,
        );
        yield* logChangedWatcherMessages(
          watcherWarningsRef,
          lastLoggedWarningsRef,
          logCoalescedBuildWarnings,
        );
      }

      const pending = yield* Ref.getAndSet(pendingRef, pendingInit);

      if (!isPendingDirty(pending)) {
        // No-op signal (e.g. a late echo after a previous cycle
        // already drained). Stay silent.
        return;
      }

      const firstSync = yield* Ref.getAndSet(initialSync, false);
      const optional = yield* Ref.updateAndGet(
        optionalPendingRef,
        (previous) => ({
          httpDirty: previous.httpDirty || pending.httpDirty,
          cronsDirty: previous.cronsDirty || pending.cronsDirty,
          authDirty: previous.authDirty || pending.authDirty,
        }),
      );
      if (!firstSync)
        yield* logPending("Dependencies may have changed, reloading…");

      if (pending.specDirty || (yield* Ref.get(fullSyncNeeded))) {
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
          yield* Ref.set(fullSyncNeeded, true);
          if (firstSync) {
            yield* Ref.update(pendingRef, (next) => ({
              ...next,
              specDirty: true,
            }));
            yield* Queue.offer(signal, undefined);
          }
          return;
        }
        yield* Ref.set(fullSyncNeeded, false);
        yield* Ref.set(failedImpls, new Set());
        yield* Ref.get(refreshWatcher).pipe(Effect.flatten);
      } else if (
        pending.implPaths.size > 0 ||
        (yield* Ref.get(failedImpls)).size > 0
      ) {
        const paths = new Set([
          ...pending.implPaths,
          ...(yield* Ref.get(failedImpls)),
        ]);
        const validated = yield* validateImplFiles([...paths]).pipe(
          CodegenError.catchAndLog,
        );
        if (Option.isNone(validated)) {
          yield* Ref.set(failedImpls, paths);
          return;
        }
        yield* Ref.set(failedImpls, new Set());
        yield* touchConvexSchema;
      }

      const dirtyOptionalFiles = [
        ...(optional.httpDirty
          ? [syncOptionalFile(generateHttp, "http.ts")]
          : []),
        ...(optional.cronsDirty
          ? [syncOptionalFile(generateCrons, "crons.ts")]
          : []),
        ...(optional.authDirty
          ? [syncOptionalFile(generateAuthConfig, "auth.config.ts")]
          : []),
      ];

      yield* Array.isReadonlyArrayNonEmpty(dirtyOptionalFiles)
        ? Effect.all(dirtyOptionalFiles, { concurrency: "unbounded" })
        : Effect.void;
      yield* Ref.set(optionalPendingRef, emptyOptional);

      if (!isPendingDirty(yield* Ref.get(pendingRef))) {
        yield* logSuccess("Generated files are up-to-date");
      }
    }),
  );
});

interface EntryPoint {
  readonly absolutePath: string;
  readonly inputPath: string;
  readonly pendingKey: PendingKey;
}

const discoverEntryPoints = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  const tryEntry = Effect.fnUntraced(function* (
    relativePath: string,
    pendingKey: PendingKey,
  ) {
    const absolutePath = path.join(confectDirectory, relativePath);
    if (!(yield* fs.exists(absolutePath))) {
      return Option.none<EntryPoint>();
    }
    return Option.some<EntryPoint>({
      absolutePath,
      inputPath: yield* fs
        .realPath(absolutePath)
        .pipe(Effect.orElseSucceed(() => absolutePath)),
      pendingKey,
    });
  });

  const fixedEntryOptions = yield* Effect.all([
    tryEntry("http.ts", "httpDirty"),
    tryEntry("crons.ts", "cronsDirty"),
    tryEntry("auth.ts", "authDirty"),
  ]);

  const moduleRelativePaths = yield* Effect.all([
    discoverLeafSpecFiles,
    discoverLeafImplFiles,
    discoverTableFiles,
  ]).pipe(Effect.map(Array.flatten));
  const moduleEntryOptions = yield* Effect.forEach(
    moduleRelativePaths,
    (relativePath) => tryEntry(relativePath, "specDirty"),
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
      absolutePath,
      inputPath: yield* fs
        .realPath(absolutePath)
        .pipe(Effect.orElseSucceed(() => absolutePath)),
      pendingKey: "specDirty",
    });
  });

  return Array.getSomes([
    ...fixedEntryOptions,
    convexConfigEntryOption,
    ...moduleEntryOptions,
  ]);
});

interface WatchState {
  readonly fingerprints: ReadonlyMap<string, string>;
  readonly graph: WatchGraph.WatchGraph;
  readonly outputHash: string;
}

const esbuildOptions = (
  path: Path.Path,
  fs: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
  projectRoot: string,
  confectDirectory: string,
  generatedDirectory: string,
  entries: ReadonlyArray<EntryPoint>,
  notExternal: ReadonlyArray<RegExp>,
  stateRef: Ref.Ref<WatchState | undefined>,
  structuralChange: boolean,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  watcherErrorsRef: Ref.Ref<WatcherMessages>,
  watcherWarningsRef: Ref.Ref<WatcherMessages>,
): esbuild.BuildOptions => {
  let fingerprints = new Map<string, string>();
  let firstBuild = true;
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
          build.onStart(() => {
            fingerprints = new Map();
          });
          build.onLoad({ filter: /.*/ }, (args) =>
            Effect.runPromise(
              Effect.gen(function* () {
                const contents = yield* fs.readFile(args.path);
                fingerprints.set(
                  args.path,
                  Hex.encode(yield* crypto.digest("SHA-256", contents)),
                );
              }).pipe(Effect.orElseSucceed(() => undefined)),
            ).then(() => undefined),
          );
          build.onEnd((result) =>
            Effect.runPromise(
              Effect.gen(function* () {
                const previous = yield* Ref.get(stateRef);
                const structureChanged = firstBuild && structuralChange;
                firstBuild = false;
                const outputHash = (yield* Effect.forEach(
                  result.outputFiles ?? [],
                  (file) =>
                    crypto
                      .digest("SHA-256", file.contents)
                      .pipe(Effect.map(Hex.encode)),
                )).join(":");
                const graph = result.metafile
                  ? WatchGraph.make(result.metafile, (file) =>
                      path.resolve(projectRoot, file),
                    )
                  : (previous?.graph ?? new Map());
                yield* Ref.set(stateRef, { fingerprints, graph, outputHash });
                yield* Ref.set(
                  watcherErrorsRef,
                  result.errors.length > 0
                    ? new Map([["entries", result.errors]])
                    : emptyWatcherMessages,
                );
                yield* Ref.set(
                  watcherWarningsRef,
                  result.warnings.length > 0
                    ? new Map([["entries", result.warnings]])
                    : emptyWatcherMessages,
                );
                const files = new Set([
                  ...(previous?.fingerprints.keys() ?? []),
                  ...fingerprints.keys(),
                ]);
                const changed = [...files].filter(
                  (file) =>
                    previous?.fingerprints.get(file) !== fingerprints.get(file),
                );
                const sources = changed.filter(
                  (file) => !file.startsWith(generatedDirectory + path.sep),
                );
                const affected = new Set([
                  ...WatchGraph.affected(graph, sources),
                  ...WatchGraph.affected(previous?.graph ?? new Map(), sources),
                ]);
                const unknownChange =
                  changed.length === 0 && previous?.outputHash !== outputHash;
                const full =
                  structureChanged ||
                  previous === undefined ||
                  (sources.length > 0 && !result.metafile) ||
                  unknownChange;
                const dirtyEntries = full
                  ? entries
                  : entries.filter((entry) => affected.has(entry.inputPath));
                yield* Ref.update(pendingRef, (pending) => {
                  const next = {
                    ...pending,
                    implPaths: new Set(pending.implPaths),
                  };
                  for (const entry of dirtyEntries) {
                    const relative = path.relative(
                      confectDirectory,
                      entry.absolutePath,
                    );
                    if (isLeafImplPath(relative) && !full) {
                      next.implPaths.add(relative);
                    } else {
                      next[entry.pendingKey] = true;
                    }
                  }
                  if (full) next.specDirty = true;
                  return next;
                });
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
  refreshWatcher: Ref.Ref<Effect.Effect<void>>,
  watcherErrorsRef: Ref.Ref<WatcherMessages>,
  watcherWarningsRef: Ref.Ref<WatcherMessages>,
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
  const stateRef = yield* Ref.make<WatchState | undefined>(undefined);
  const crypto = yield* Crypto.Crypto;
  let current:
    | {
        readonly key: string;
        readonly scope: Scope.Closeable;
        readonly entries: ReadonlyArray<EntryPoint>;
      }
    | undefined;

  const sync = Effect.gen(function* () {
    const entries = yield* discoverEntryPoints;
    const desiredPaths = new Set(entries.map((entry) => entry.absolutePath));
    const key = [...desiredPaths].sort().join("\n");
    if (current?.key === key) return;
    const structuralChange = current !== undefined;
    if (structuralChange)
      yield* Ref.update(pendingRef, (pending) => ({
        ...pending,
        specDirty: true,
      }));
    const removedOptional =
      current?.entries.filter(
        (entry) =>
          entry.pendingKey !== "specDirty" &&
          !desiredPaths.has(entry.absolutePath),
      ) ?? [];
    yield* Ref.update(pendingRef, (pending) =>
      removedOptional.reduce(
        (next, entry) => ({ ...next, [entry.pendingKey]: true }),
        pending,
      ),
    );
    if (current) yield* Scope.close(current.scope, Exit.void);
    const scope = yield* Scope.fork(parentScope, "sequential");
    current = { key, scope, entries };
    yield* Ref.set(watcherErrorsRef, emptyWatcherMessages);
    yield* Ref.set(watcherWarningsRef, emptyWatcherMessages);
    if (entries.length === 0) {
      yield* Ref.update(pendingRef, (pending) => ({
        ...pending,
        specDirty: true,
      }));
      yield* Queue.offer(signal, undefined);
      yield* Ref.set(stateRef, {
        fingerprints: new Map(),
        graph: new Map(),
        outputHash: "",
      });
      return;
    }

    const tsconfig = loadTsConfig(projectRoot);
    const notExternal = tsconfigPathsToRegExp(
      tsconfig?.data.compilerOptions?.paths ?? {},
    );
    yield* Effect.acquireRelease(
      Effect.promise(() =>
        esbuild.context(
          esbuildOptions(
            path,
            fs,
            crypto,
            projectRoot,
            confectDirectory,
            generatedDirectory,
            entries,
            notExternal,
            stateRef,
            structuralChange,
            signal,
            pendingRef,
            watcherErrorsRef,
            watcherWarningsRef,
          ),
        ),
      ),
      (ctx) =>
        Effect.promise(() => ctx.dispose()).pipe(
          Effect.andThen(Ref.set(refreshWatcher, Effect.void)),
        ),
    ).pipe(
      Effect.flatMap((ctx) =>
        Ref.set(
          refreshWatcher,
          Effect.promise(() =>
            ctx
              .rebuild()
              .catch(() => undefined)
              .then(() => ctx.rebuild())
              .then(
                () => undefined,
                () => undefined,
              ),
          ),
        ).pipe(Effect.andThen(Effect.promise(() => ctx.watch()))),
      ),
      Scope.provide(scope),
    );
  });

  yield* sync;
  return yield* Effect.forever(
    Queue.take(restartQueue).pipe(Effect.andThen(sync)),
  );
}, Effect.provide(NodeCrypto.layer));

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

const TOP_LEVEL_OPTIONAL_FILES: ReadonlySet<string> = new Set([
  "http.ts",
  "crons.ts",
  "auth.ts",
]);

const flipDirtyAndSignal = (
  pendingRef: Ref.Ref<Pending>,
  signal: Queue.Queue<void>,
  key: PendingKey,
  restartQueue: Queue.Queue<void>,
  restart: boolean,
) =>
  pipe(
    Ref.update(pendingRef, (p) => ({ ...p, [key]: true })),
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

  if (TOP_LEVEL_OPTIONAL_FILES.has(relativePath)) {
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
      "specDirty",
      restartQueue,
      isLifecycleChange,
    );
  }

  if (
    isLeafSpecPath(relativePath) ||
    isLeafImplPath(relativePath) ||
    relativePath.split(/[/\\]/)[0] === TABLES_DIRNAME
  ) {
    return isLifecycleChange
      ? Queue.offer(restartQueue, undefined)
      : Effect.void;
  }

  // Any other `.ts` under `confect/` (helpers like `tables/notes.ts`).
  // Updates to such files are handled by the esbuild watcher for whichever
  // entry point imports them—its onEnd flips the right dirty flag.
  // Creates are our safety net: when a previously-missing import is added,
  // esbuild may not have its parent directory on a poll path, so we
  // re-run codegen on Create here.
  if (eventTag === "Create") {
    return flipDirtyAndSignal(
      pendingRef,
      signal,
      "specDirty",
      restartQueue,
      false,
    );
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
