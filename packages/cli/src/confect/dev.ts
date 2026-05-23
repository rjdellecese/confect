import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import {
  Array,
  Console,
  Deferred,
  Duration,
  Effect,
  Equal,
  ExecutionStrategy,
  Exit,
  HashSet,
  Match,
  Option,
  pipe,
  Queue,
  Ref,
  Scope,
  Stream,
  String,
} from "effect";
import * as esbuild from "esbuild";
import { BundleFailedError, logBuildError } from "../BuildError";
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
    const initialFunctionPaths =
      initialResult?.functionPaths ?? emptyFunctionPaths;

    const pendingRef = yield* Ref.make<Pending>(pendingInit);
    const signal = yield* Queue.sliding<void>(1);
    const restartQueue = yield* Queue.sliding<void>(1);

    yield* Effect.all(
      [
        Effect.scoped(entryPointsWatcher(signal, pendingRef, restartQueue)),
        confectStructureWatcher(signal, pendingRef, restartQueue),
        syncLoop(signal, pendingRef, initialFunctionPaths),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const syncLoop = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  initialFunctionPaths: FunctionPaths.FunctionPaths,
) =>
  Effect.gen(function* () {
    const functionPathsRef = yield* Ref.make(initialFunctionPaths);
    const initialSyncDone = yield* Deferred.make<void>();

    return yield* Effect.forever(
      Effect.gen(function* () {
        yield* Effect.logDebug("Running sync loop…");
        yield* Queue.take(signal);

        const isDone = yield* Deferred.isDone(initialSyncDone);
        yield* Effect.when(
          logPending("Dependencies may have changed, reloading…"),
          () => isDone,
        );
        yield* Deferred.succeed(initialSyncDone, undefined);

        const pending = yield* Ref.getAndSet(pendingRef, pendingInit);

        if (pending.specDirty) {
          const current = yield* codegenHandler.pipe(
            Effect.tap(({ functionPaths: nextFunctionPaths }) =>
              Effect.gen(function* () {
                const previous = yield* Ref.get(functionPathsRef);
                yield* logFunctionPathDiff(previous, nextFunctionPaths);
                yield* Ref.set(functionPathsRef, nextFunctionPaths);
              }),
            ),
            Effect.tap(() => logSuccess("Generated files are up-to-date")),
            CodegenError.catchAndLog,
          );
          if (current === undefined) {
            return;
          }
          if (current.anyWritesHappened) {
            // Codegen rewrote files that the esbuild watchers track as entry
            // points (e.g. `_generated/spec.ts`). The watchers will fire an
            // onEnd → signal echo that we don't want to act on. Drain one
            // pending offer so the next take blocks for a genuine change.
            yield* Queue.poll(signal);
          }
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

  return Array.filterMap([...fixedEntryOptions, ...implEntryOptions], (o) => o);
});

const esbuildOptions = (
  entry: EntryPoint,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) => ({
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
          if (result.errors.length > 0) {
            Effect.runPromise(
              logBuildError(
                new BundleFailedError({
                  file: entry.displayPath,
                  errors: result.errors,
                }),
              ),
            );
          }

          Effect.runPromise(
            pipe(
              Ref.update(pendingRef, (p) => ({
                ...p,
                [entry.pendingKey]: true,
              })),
              Effect.andThen(Queue.offer(signal, undefined)),
            ),
          );
        });
      },
    },
  ],
});

const createEntryPointWatcher = (
  entry: EntryPoint,
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const ctx = await esbuild.context(
        esbuildOptions(entry, signal, pendingRef),
      );
      await ctx.watch();
      return ctx;
    }),
    (ctx) =>
      Effect.promise(() => ctx.dispose()).pipe(
        Effect.tap(() =>
          Effect.logDebug(`esbuild watcher disposed: ${entry.displayPath}`),
        ),
      ),
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
) =>
  Effect.gen(function* () {
    const parentScope = yield* Effect.scope;
    const scopesRef = yield* Ref.make(
      new Map<string, Scope.CloseableScope>(),
    );

    const sync = Effect.gen(function* () {
      const desired = yield* discoverEntryPoints;
      const desiredByPath = new Map(desired.map((e) => [e.absolutePath, e]));
      const current = yield* Ref.get(scopesRef);
      const next = new Map(current);

      for (const [absolutePath, childScope] of current) {
        if (!desiredByPath.has(absolutePath)) {
          yield* Scope.close(childScope, Exit.void);
          next.delete(absolutePath);
        }
      }

      for (const entry of desired) {
        if (next.has(entry.absolutePath)) {
          continue;
        }
        const childScope = yield* Scope.fork(
          parentScope,
          ExecutionStrategy.sequential,
        );
        yield* createEntryPointWatcher(entry, signal, pendingRef).pipe(
          Scope.extend(childScope),
        );
        next.set(entry.absolutePath, childScope);
      }

      yield* Ref.set(scopesRef, next);
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
