import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import {
  Array,
  Chunk,
  Clock,
  Console,
  Duration,
  Effect,
  Equal,
  ExecutionStrategy,
  Exit,
  HashSet,
  Match,
  Option,
  Order,
  pipe,
  Queue,
  Ref,
  Scope,
  Stream,
  String,
} from "effect";
import * as esbuild from "esbuild";
import { logCoalescedBuildErrors } from "../BuildError";
import { absoluteExternalsPlugin, EXTERNAL_PACKAGES } from "../Bundler";
import * as CodegenError from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import type * as GroupPaths from "../GroupPaths";
import {
  discoverLeafImplFiles,
  isLeafImplPath,
  isLeafSpecPath,
} from "../LeafModule";
import {
  logFunctionAdded,
  logFunctionRemoved,
  logPending,
  logSuccess,
} from "../log";
import { ProjectRoot } from "../ProjectRoot";
import { generateAuthConfig, generateCrons, generateHttp } from "../utils";
import { codegenHandler, loadPreviousFunctionPaths } from "./codegen";

const GENERATED_SPEC_PATH = "_generated/spec.ts";
const GENERATED_NODE_SPEC_PATH = "_generated/nodeSpec.ts";

// Quiescence window: the sync loop waits this long for further signals
// after each batch. One user edit fires `onEnd` on every esbuild
// watcher that touches the file, and rebuild times vary across entry
// points so the onEnds can be spread over hundreds of milliseconds.
// The drain keeps extending its wait (bounded by `COALESCE_MAX_WAIT`)
// until no new signals arrive within the window, collapsing the whole
// burst into a single codegen cycle.
const COALESCE_QUIESCENCE = Duration.millis(300);

// Upper bound on `drainUntilQuiescent` so a pathological infinite
// signal stream can't pin the sync loop forever.
const COALESCE_MAX_WAIT = Duration.seconds(5);

// How long to wait for esbuild watchers to react to codegen's own
// writes (e.g. an updated `_generated/spec.ts`). Added on top of the
// quiescence drain when codegen reported writes happened.
const ECHO_COOLDOWN = Duration.millis(500);

const emptyFunctionPaths = FunctionPaths.FunctionPaths.make(HashSet.empty());

type Pending = {
  readonly specDirty: boolean;
  readonly httpDirty: boolean;
  readonly cronsDirty: boolean;
  readonly authDirty: boolean;
};

type PendingKey = keyof Pending;

const pendingInit: Pending = {
  specDirty: false,
  httpDirty: false,
  cronsDirty: false,
  authDirty: false,
};

const isPendingDirty = (p: Pending): boolean =>
  p.specDirty || p.httpDirty || p.cronsDirty || p.authDirty;

type WatcherErrors = ReadonlyMap<string, readonly esbuild.Message[]>;

const emptyWatcherErrors: WatcherErrors = new Map();

const changeChar = (change: "Added" | "Removed" | "Modified") =>
  Match.value(change).pipe(
    Match.when("Added", () => ({ char: "+", color: Ansi.green })),
    Match.when("Removed", () => ({ char: "-", color: Ansi.red })),
    Match.when("Modified", () => ({ char: "~", color: Ansi.yellow })),
    Match.exhaustive,
  );

const logFileChangeIndented = (
  change: "Added" | "Removed" | "Modified",
  fullPath: string,
) =>
  Effect.gen(function* () {
    const projectRoot = yield* ProjectRoot.get;
    const path = yield* Path.Path;

    const prefix = projectRoot + path.sep;
    const suffix = pipe(fullPath, String.startsWith(prefix))
      ? pipe(fullPath, String.slice(prefix.length))
      : fullPath;

    const { char, color } = changeChar(change);

    yield* Console.log(
      pipe(
        AnsiDoc.char(char),
        AnsiDoc.annotate(color),
        AnsiDoc.catWithSpace(
          AnsiDoc.hcat([
            pipe(AnsiDoc.text(prefix), AnsiDoc.annotate(Ansi.blackBright)),
            pipe(AnsiDoc.text(suffix), AnsiDoc.annotate(color)),
          ]),
        ),
        AnsiDoc.render({ style: "pretty" }),
      ),
    );
  });

const logFunctionPathDiff = (
  previous: FunctionPaths.FunctionPaths,
  current: FunctionPaths.FunctionPaths,
) =>
  Effect.gen(function* () {
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
    yield* Effect.forEach(groupsChanged, (gp) =>
      Effect.gen(function* () {
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
    const initialResult = yield* codegenHandler.pipe(
      Effect.tap(({ functionPaths }) =>
        logFunctionPathDiff(previousFunctionPaths, functionPaths),
      ),
      Effect.tap(() => logSuccess("Generated files are up-to-date")),
      CodegenError.catchAndLog,
    );
    const initialFunctionPaths = Option.match(initialResult, {
      onNone: () => emptyFunctionPaths,
      onSome: ({ functionPaths }) => functionPaths,
    });

    const pendingRef = yield* Ref.make<Pending>(pendingInit);
    const signal = yield* Queue.sliding<void>(1);
    const restartQueue = yield* Queue.sliding<void>(1);
    const watcherErrorsRef = yield* Ref.make<WatcherErrors>(emptyWatcherErrors);

    yield* Effect.all(
      [
        Effect.scoped(
          entryPointsWatcher(
            signal,
            pendingRef,
            restartQueue,
            watcherErrorsRef,
          ),
        ),
        confectStructureWatcher(signal, pendingRef, restartQueue),
        syncLoop(signal, pendingRef, initialFunctionPaths, watcherErrorsRef),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const esbuildMessageKey = (m: esbuild.Message): string =>
  `${m.location?.file ?? ""}:${m.location?.line ?? ""}:${m.location?.column ?? ""}:${m.text}`;

const allMessages = (errors: WatcherErrors): ReadonlyArray<esbuild.Message> =>
  pipe(Array.fromIterable(errors.values()), Array.flatten);

const dedupeWatcherErrors = (
  errors: WatcherErrors,
): ReadonlyArray<esbuild.Message> =>
  pipe(
    allMessages(errors),
    Array.dedupeWith(
      (messageA, messageB) =>
        esbuildMessageKey(messageA) === esbuildMessageKey(messageB),
    ),
  );

const watcherErrorsSignature = (errors: WatcherErrors): string =>
  pipe(
    allMessages(errors),
    Array.map(esbuildMessageKey),
    Array.dedupe,
    Array.sort(Order.string),
    Array.join("\n"),
  );

/**
 * Log any watcher errors that haven't already been logged at their
 * current signature. Suppresses the per-watcher fanout that happens
 * when one root cause (e.g. a missing import) breaks every entry
 * point's build at the same source location.
 */
const logChangedWatcherErrors = (
  watcherErrorsRef: Ref.Ref<WatcherErrors>,
  lastLoggedSignatureRef: Ref.Ref<string>,
) =>
  Effect.gen(function* () {
    const errors = yield* Ref.get(watcherErrorsRef);
    const signature = watcherErrorsSignature(errors);
    const previous = yield* Ref.get(lastLoggedSignatureRef);
    if (signature === previous) return;
    yield* Ref.set(lastLoggedSignatureRef, signature);
    if (errors.size === 0) return;
    yield* logCoalescedBuildErrors(dedupeWatcherErrors(errors));
  });

/**
 * Block until the signal queue has been quiet for `quiescence`. esbuild
 * watchers' `onEnd` events for a single user edit can be spread across
 * hundreds of milliseconds, so a fixed window misses late arrivals.
 * Bounded by `maxWait` so pathological signal floods can't pin the
 * loop forever.
 */
const drainUntilQuiescent = (
  signal: Queue.Queue<void>,
  quiescence: Duration.Duration,
  maxWait: Duration.Duration,
) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis;
    const maxMillis = Duration.toMillis(maxWait);
    yield* Effect.iterate(true as boolean, {
      while: (keepGoing) => keepGoing,
      body: () =>
        Effect.gen(function* () {
          yield* Effect.sleep(quiescence);
          const drained = yield* Queue.takeAll(signal);
          if (Chunk.isEmpty(drained)) return false;
          const now = yield* Clock.currentTimeMillis;
          return now - start < maxMillis;
        }),
    });
  });

const syncLoop = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  initialFunctionPaths: FunctionPaths.FunctionPaths,
  watcherErrorsRef: Ref.Ref<WatcherErrors>,
) =>
  Effect.gen(function* () {
    const functionPathsRef = yield* Ref.make(initialFunctionPaths);
    const lastLoggedErrorsRef = yield* Ref.make<string>("");

    return yield* Effect.forever(
      Effect.gen(function* () {
        yield* Effect.logDebug("Running sync loop…");
        // Wait for the first signal of a burst, then keep absorbing
        // follow-up signals from other watchers' onEnds until the queue
        // stays quiet for `COALESCE_QUIESCENCE`.
        yield* Queue.take(signal);
        yield* drainUntilQuiescent(
          signal,
          COALESCE_QUIESCENCE,
          COALESCE_MAX_WAIT,
        );

        yield* logChangedWatcherErrors(watcherErrorsRef, lastLoggedErrorsRef);

        const pending = yield* Ref.getAndSet(pendingRef, pendingInit);

        if (!isPendingDirty(pending)) {
          // No-op signal (e.g. a late echo after a previous cycle
          // already drained). Stay silent.
          return;
        }

        yield* logPending("Dependencies may have changed, reloading…");

        if (pending.specDirty) {
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
            return;
          }
          // Drain any stragglers from this cycle's burst (slow watchers
          // whose onEnd fired after the first quiescence) plus, when
          // codegen wrote, the echo signals esbuild emits in response
          // to our writes. Reset `pendingRef` so those drained signals
          // don't carry a dirty flag into the next cycle.
          if (current.value.anyWritesHappened) {
            yield* Effect.sleep(ECHO_COOLDOWN);
          }
          yield* drainUntilQuiescent(
            signal,
            COALESCE_QUIESCENCE,
            COALESCE_MAX_WAIT,
          );
          yield* Ref.set(pendingRef, pendingInit);
        }

        const dirtyOptionalFiles = [
          ...(pending.httpDirty
            ? [syncOptionalFile(generateHttp, "http.ts")]
            : []),
          ...(pending.cronsDirty
            ? [syncOptionalFile(generateCrons, "crons.ts")]
            : []),
          ...(pending.authDirty
            ? [syncOptionalFile(generateAuthConfig, "auth.config.ts")]
            : []),
        ];

        yield* Array.isNonEmptyReadonlyArray(dirtyOptionalFiles)
          ? Effect.all(dirtyOptionalFiles, { concurrency: "unbounded" })
          : Effect.void;

        yield* logSuccess("Generated files are up-to-date");
      }),
    );
  });

interface EntryPoint {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly pendingKey: PendingKey;
}

/**
 * Every file whose import graph codegen should react to. Each one becomes
 * its own scoped esbuild watcher; the union of their watches gives us
 * dependency-aware tracking of anything reachable from `confect/`,
 * including files outside `confect/`.
 */
const discoverEntryPoints = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projectRoot = yield* ProjectRoot.get;
  const confectDirectory = yield* ConfectDirectory.get;

  const tryEntry = (relativePath: string, pendingKey: PendingKey) =>
    Effect.gen(function* () {
      const absolutePath = path.join(confectDirectory, relativePath);
      if (!(yield* fs.exists(absolutePath))) {
        return Option.none<EntryPoint>();
      }
      return Option.some<EntryPoint>({
        absolutePath,
        displayPath: path.relative(projectRoot, absolutePath),
        pendingKey,
      });
    });

  const fixedEntryOptions = yield* Effect.all([
    tryEntry(GENERATED_SPEC_PATH, "specDirty"),
    tryEntry(GENERATED_NODE_SPEC_PATH, "specDirty"),
    tryEntry("schema.ts", "specDirty"),
    tryEntry("http.ts", "httpDirty"),
    tryEntry("crons.ts", "cronsDirty"),
    tryEntry("auth.ts", "authDirty"),
  ]);

  const implRelativePaths = yield* discoverLeafImplFiles;
  const implEntryOptions = yield* Effect.forEach(
    implRelativePaths,
    (relativePath) => tryEntry(relativePath, "specDirty"),
  );

  return Array.getSomes([...fixedEntryOptions, ...implEntryOptions]);
});

const esbuildOptions = (
  entry: EntryPoint,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  watcherErrorsRef: Ref.Ref<WatcherErrors>,
) => {
  // First `onEnd` fires when esbuild finishes the watcher's initial
  // build. At startup that's an echo of the just-completed initial
  // codegen pass; for a watcher spawned mid-session (e.g. a newly
  // added impl) it's an echo of the codegen run that triggered the
  // restart. Either way, the entry's contents were already accounted
  // for, so we record any errors but don't flip dirty or push a
  // signal — only genuine subsequent rebuilds should do that.
  const initialBuildSeenRef = Ref.unsafeMake(false);
  return {
    entryPoints: [entry.absolutePath],
    bundle: true,
    write: false,
    metafile: true,
    platform: "node" as const,
    format: "esm" as const,
    logLevel: "silent" as const,
    external: EXTERNAL_PACKAGES,
    plugins: [
      absoluteExternalsPlugin,
      {
        name: "notify-rebuild",
        setup(build: esbuild.PluginBuild) {
          build.onEnd((result) => {
            Effect.runPromise(
              Effect.gen(function* () {
                const wasInitial = yield* Ref.getAndSet(
                  initialBuildSeenRef,
                  true,
                );
                const isInitial = !wasInitial;
                yield* Ref.update(watcherErrorsRef, (current) => {
                  const next = new Map(current);
                  if (result.errors.length > 0) {
                    next.set(entry.absolutePath, result.errors);
                  } else {
                    next.delete(entry.absolutePath);
                  }
                  return next;
                });
                if (isInitial && result.errors.length === 0) return;
                yield* Ref.update(pendingRef, (p) => ({
                  ...p,
                  [entry.pendingKey]: true,
                }));
                yield* Queue.offer(signal, undefined);
              }),
            );
          });
        },
      },
    ],
  };
};

const createEntryPointWatcher = (
  entry: EntryPoint,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  watcherErrorsRef: Ref.Ref<WatcherErrors>,
) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const ctx = await esbuild.context(
        esbuildOptions(entry, signal, pendingRef, watcherErrorsRef),
      );
      await ctx.watch();
      return ctx;
    }),
    (ctx) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => ctx.dispose());
        // Clear any errors recorded by this watcher so a disposed
        // watcher can't leave stale errors visible to the sync loop.
        yield* Ref.update(watcherErrorsRef, (current) => {
          if (!current.has(entry.absolutePath)) return current;
          const next = new Map(current);
          next.delete(entry.absolutePath);
          return next;
        });
        yield* Effect.logDebug(
          `esbuild watcher disposed: ${entry.displayPath}`,
        );
      }),
  );

/**
 * Holds one scoped esbuild watcher per entry point and reconciles the set
 * whenever something offers to `restartQueue`. Adding or removing an entry
 * point only spawns/disposes the affected watcher; unchanged entries keep
 * their existing context, so a structural change doesn't churn watchers
 * for unrelated files.
 */
const entryPointsWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  restartQueue: Queue.Queue<void>,
  watcherErrorsRef: Ref.Ref<WatcherErrors>,
) =>
  Effect.gen(function* () {
    const parentScope = yield* Effect.scope;
    const scopesRef = yield* Ref.make(new Map<string, Scope.CloseableScope>());

    const sync = Effect.gen(function* () {
      const desired = yield* discoverEntryPoints;
      const desiredByPath = new Map(
        desired.map((entryPoint) => [entryPoint.absolutePath, entryPoint]),
      );
      const current = yield* Ref.get(scopesRef);

      yield* Effect.forEach(
        Array.fromIterable(current),
        ([absolutePath, childScope]) =>
          desiredByPath.has(absolutePath)
            ? Effect.void
            : Scope.close(childScope, Exit.void).pipe(
                Effect.andThen(
                  Ref.update(scopesRef, (scopes) => {
                    const updated = new Map(scopes);
                    updated.delete(absolutePath);
                    return updated;
                  }),
                ),
              ),
      );

      yield* Effect.forEach(desired, (entry) =>
        Effect.gen(function* () {
          const existing = yield* Ref.get(scopesRef);
          if (existing.has(entry.absolutePath)) return;

          const childScope = yield* Scope.fork(
            parentScope,
            ExecutionStrategy.sequential,
          );
          yield* createEntryPointWatcher(
            entry,
            signal,
            pendingRef,
            watcherErrorsRef,
          ).pipe(Scope.extend(childScope));
          yield* Ref.update(scopesRef, (scopes) => {
            const updated = new Map(scopes);
            updated.set(entry.absolutePath, childScope);
            return updated;
          });
        }),
      );
    });

    yield* sync;

    return yield* Effect.forever(
      Queue.take(restartQueue).pipe(Effect.andThen(sync)),
    );
  });

/**
 * Single recursive `fs.watch` on `confect/`. Flips the matching dirty flag
 * for any change to an entry-point-shaped file (so codegen runs without
 * waiting on a newly spawned esbuild watcher), and offers to
 * `restartQueue` when an entry point is created or removed so the watcher
 * manager picks up the new set.
 */
const confectStructureWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  restartQueue: Queue.Queue<void>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* pipe(
      fs.watch(confectDirectory, { recursive: true }),
      Stream.debounce(Duration.millis(200)),
      Stream.runForEach((event) =>
        handleConfectChange({
          relativePath: path.relative(confectDirectory, event.path),
          eventTag: event._tag,
          signal,
          pendingRef,
          restartQueue,
        }),
      ),
    );
  });

const TOP_LEVEL_OPTIONAL_KEYS: ReadonlyMap<string, PendingKey> = new Map([
  ["http.ts", "httpDirty"],
  ["crons.ts", "cronsDirty"],
  ["auth.ts", "authDirty"],
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
  // _generated/ files are written by codegen itself; reacting to them here
  // would form a loop. The esbuild watchers track the generated specs as
  // entry points, so changes there flow back through `notify-rebuild`.
  if (relativePath.split(/[/\\]/).includes("_generated")) {
    return Effect.void;
  }

  if (!relativePath.endsWith(".ts")) {
    return Effect.void;
  }

  const isLifecycleChange = eventTag !== "Update";

  const topLevelKey = TOP_LEVEL_OPTIONAL_KEYS.get(relativePath);
  if (topLevelKey !== undefined) {
    return flipDirtyAndSignal(
      pendingRef,
      signal,
      topLevelKey,
      restartQueue,
      isLifecycleChange,
    );
  }

  if (relativePath === "schema.ts") {
    return flipDirtyAndSignal(
      pendingRef,
      signal,
      "specDirty",
      restartQueue,
      isLifecycleChange,
    );
  }

  if (isLeafSpecPath(relativePath) || isLeafImplPath(relativePath)) {
    return flipDirtyAndSignal(
      pendingRef,
      signal,
      "specDirty",
      restartQueue,
      isLifecycleChange,
    );
  }

  // Any other `.ts` under `confect/` (helpers like `tables/Notes.ts`).
  // Updates to such files are handled by the esbuild watcher for whichever
  // entry point imports them — its onEnd flips the right dirty flag.
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
