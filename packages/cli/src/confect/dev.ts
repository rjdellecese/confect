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
  HashSet,
  Match,
  Option,
  pipe,
  Queue,
  Ref,
  Stream,
  String,
} from "effect";
import type { ReadonlyRecord } from "effect/Record";
import * as esbuild from "esbuild";
import { BundleFailedError, logBuildError } from "../BuildError";
import * as CodegenError from "../CodegenError";
import { ConfectDirectory } from "../ConfectDirectory";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import type * as GroupPaths from "../GroupPaths";
import {
  logFunctionAdded,
  logFunctionRemoved,
  logPending,
  logSuccess,
} from "../log";
import {
  isLeafImplPath,
  isLeafSpecPath,
  isNodeLeafModule,
} from "../LeafModule";
import { ProjectRoot } from "../ProjectRoot";
import { absoluteExternalsPlugin, EXTERNAL_PACKAGES } from "../Bundler";
import {
  generateAuthConfig,
  generateCrons,
  generateHttp,
} from "../utils";
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

const pendingInit: Pending = {
  specDirty: false,
  httpDirty: false,
  cronsDirty: false,
  authDirty: false,
};

const getGeneratedSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  return path.join(confectDirectory, GENERATED_SPEC_PATH);
});

const getGeneratedNodeSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  return path.join(confectDirectory, GENERATED_NODE_SPEC_PATH);
});

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
    const initialFunctionPaths =
      (yield* codegenHandler.pipe(
        Effect.tap((current) =>
          logFunctionPathDiff(previousFunctionPaths, current),
        ),
        Effect.tap(() => logSuccess("Generated files are up-to-date")),
        CodegenError.catchAndLog,
      )) ?? emptyFunctionPaths;

    const pendingRef = yield* Ref.make<Pending>(pendingInit);
    const signal = yield* Queue.sliding<void>(1);
    const specWatcherRestartQueue = yield* Queue.sliding<void>(1);

    yield* Effect.all(
      [
        generatedSpecWatcher(specWatcherRestartQueue),
        leafModuleWatcher(signal, pendingRef, specWatcherRestartQueue),
        confectDirectoryWatcher(signal, pendingRef),
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
            Effect.tap((nextFunctionPaths) =>
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

const esbuildOptions = (entryPoint: string, displayPath: string) => ({
  entryPoints: [entryPoint],
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
                  file: displayPath,
                  errors: result.errors,
                }),
              ),
            );
          }
        });
      },
    },
  ],
});

const createSpecWatcher = (entryPoint: string, displayPath: string) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const ctx = await esbuild.context(esbuildOptions(entryPoint, displayPath));
      await ctx.watch();
      return ctx;
    }),
    (ctx) =>
      Effect.promise(() => ctx.dispose()).pipe(
        Effect.tap(() => Effect.logDebug("esbuild watcher disposed")),
      ),
  );

const generatedSpecWatcher = (specWatcherRestartQueue: Queue.Queue<void>) =>
  Effect.forever(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const projectRoot = yield* ProjectRoot.get;
      const specPath = yield* getGeneratedSpecPath;
      const nodeSpecPath = yield* getGeneratedNodeSpecPath;

      if (!(yield* fs.exists(specPath))) {
        yield* Queue.take(specWatcherRestartQueue);
        return;
      }

      const nodeSpecExists = yield* fs.exists(nodeSpecPath);
      const specWatcher = createSpecWatcher(
        specPath,
        path.relative(projectRoot, specPath),
      );
      const nodeSpecWatcher = nodeSpecExists
        ? createSpecWatcher(
            nodeSpecPath,
            path.relative(projectRoot, nodeSpecPath),
          )
        : Effect.void;

      yield* Effect.race(
        Effect.scoped(
          Effect.all([specWatcher, nodeSpecWatcher], {
            concurrency: "unbounded",
          }).pipe(Effect.zipRight(Effect.never)),
        ),
        Queue.take(specWatcherRestartQueue),
      );
    }),
  );

const isUserLeafModulePath = (relativePath: string) => {
  if (!isLeafSpecPath(relativePath) && !isLeafImplPath(relativePath)) {
    return false;
  }

  return !relativePath.split(/[/\\]/).includes("_generated");
};

const leafModuleWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  specWatcherRestartQueue: Queue.Queue<void>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* pipe(
      fs.watch(confectDirectory, { recursive: true }),
      Stream.debounce(Duration.millis(200)),
      Stream.runForEach((event) => {
        const relativePath = path.relative(confectDirectory, event.path);
        if (!isUserLeafModulePath(relativePath)) {
          return Effect.void;
        }

        return Ref.update(pendingRef, (pending) => ({
          ...pending,
          specDirty: true,
        })).pipe(
          Effect.andThen(Queue.offer(signal, undefined)),
          Effect.andThen(
            isLeafSpecPath(relativePath) && isNodeLeafModule(relativePath)
              ? Queue.offer(specWatcherRestartQueue, undefined)
              : Effect.void,
          ),
        );
      }),
    );
  });

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

const optionalConfectFiles: ReadonlyRecord<string, keyof Pending> = {
  "http.ts": "httpDirty",
  "crons.ts": "cronsDirty",
  "auth.ts": "authDirty",
};

const confectDirectoryWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* pipe(
      fs.watch(confectDirectory),
      Stream.runForEach((event) => {
        const basename = path.basename(event.path);
        const pendingKey = optionalConfectFiles[basename];

        if (pendingKey !== undefined) {
          return pipe(
            pendingRef,
            Ref.update((pending) => ({ ...pending, [pendingKey]: true })),
            Effect.andThen(Queue.offer(signal, undefined)),
          );
        }
        return Effect.void;
      }),
    );
  });
