import { Spec } from "@confect/core";
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
  Schema,
  Stream,
  String,
} from "effect";
import type { ReadonlyRecord } from "effect/Record";
import { Command } from "effect/unstable/cli";
import * as esbuild from "esbuild";

import { findConfectDirectory } from "../ConfectDirectory";
import { findConvexDirectory } from "../ConvexDirectory";
import type * as FunctionPath from "../FunctionPath";
import * as FunctionPaths from "../FunctionPaths";
import * as GroupPath from "../GroupPath";
import * as Fs from "../internal/fs";
import * as Path from "../internal/path";
import { colors, logFailure, logPending, logSuccess } from "../log";
import { findProjectRoot } from "../ProjectRoot";
import {
  bundleAndImport,
  EXTERNAL_PACKAGES,
  generateAuthConfig,
  generateCrons,
  generateHttp,
  removeGroups,
  writeGroups,
} from "../utils";
import {
  codegenHandler,
  generateNodeApi,
  generateNodeRegisteredFunctions,
} from "./codegen";

type Pending = {
  readonly specDirty: boolean;
  readonly nodeImplDirty: boolean;
  readonly httpDirty: boolean;
  readonly cronsDirty: boolean;
  readonly authDirty: boolean;
};

const pendingInit: Pending = {
  specDirty: false,
  nodeImplDirty: false,
  httpDirty: false,
  cronsDirty: false,
  authDirty: false,
};

type ChangeKind = "Added" | "Removed" | "Modified";

const changeStyle = (change: ChangeKind) =>
  Match.value(change).pipe(
    Match.when("Added", () => ({ char: "+", color: colors.green })),
    Match.when("Removed", () => ({ char: "-", color: colors.red })),
    Match.when("Modified", () => ({ char: "~", color: colors.yellow })),
    Match.exhaustive,
  );

const logFileChangeIndented = (change: ChangeKind, fullPath: string) =>
  Effect.gen(function* () {
    const projectRoot = yield* findProjectRoot;

    const prefix = projectRoot + Path.sep;
    const suffix = pipe(fullPath, String.startsWith(prefix))
      ? pipe(fullPath, String.slice(prefix.length))
      : fullPath;

    const { char, color } = changeStyle(change);

    yield* Console.log(
      `${color(char)} ${colors.blackBright(prefix)}${color(suffix)}`,
    );
  });

const logFunctionAddedIndented = (functionPath: FunctionPath.FunctionPath) =>
  Console.log(
    `  ${colors.green("+")} ${colors.blackBright(
      GroupPath.toString(functionPath.groupPath) + ".",
    )}${colors.green(functionPath.name)}`,
  );

const logFunctionRemovedIndented = (functionPath: FunctionPath.FunctionPath) =>
  Console.log(
    `  ${colors.red("-")} ${colors.blackBright(
      GroupPath.toString(functionPath.groupPath) + ".",
    )}${colors.red(functionPath.name)}`,
  );

export const dev = Command.make("dev", {}, () =>
  Effect.gen(function* () {
    yield* logPending("Performing initial sync…");
    const initialFunctionPaths = yield* codegenHandler;

    const pendingRef = yield* Ref.make<Pending>(pendingInit);
    const signal = yield* Queue.sliding<void>(1);
    const specWatcherRestartQueue = yield* Queue.sliding<void>(1);

    yield* Effect.all(
      [
        specFileWatcher(signal, pendingRef, specWatcherRestartQueue),
        confectDirectoryWatcher(signal, pendingRef, specWatcherRestartQueue),
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
        yield* Effect.logDebug("Running sync loop...");
        yield* Queue.take(signal);

        const isDone = yield* Deferred.isDone(initialSyncDone);
        if (isDone) {
          yield* logPending("Dependencies changed, reloading…");
        }
        yield* Deferred.succeed(initialSyncDone, undefined);

        const pending = yield* Ref.getAndSet(pendingRef, pendingInit);

        if (pending.specDirty || pending.nodeImplDirty) {
          yield* generateNodeApi;
          yield* generateNodeRegisteredFunctions;
        }

        const specResult: Option.Option<void> = pending.specDirty
          ? yield* loadSpec.pipe(
              Effect.flatMap((spec) =>
                Effect.gen(function* () {
                  yield* Effect.logDebug("Spec loaded");

                  const previous = yield* Ref.get(functionPathsRef);

                  const convexDirectory = yield* findConvexDirectory;

                  const current = FunctionPaths.make(spec);
                  const {
                    functionsAdded,
                    functionsRemoved,
                    groupsRemoved,
                    groupsAdded,
                    groupsChanged,
                  } = FunctionPaths.diff(previous, current);

                  // Removed groups
                  yield* removeGroups(groupsRemoved);
                  yield* Effect.forEach(groupsRemoved, (gp) =>
                    Effect.gen(function* () {
                      const relativeModulePath = GroupPath.modulePath(gp);
                      const filePath = Path.join(
                        convexDirectory,
                        relativeModulePath,
                      );
                      yield* logFileChangeIndented("Removed", filePath);
                      yield* Effect.forEach(
                        Array.fromIterable(
                          HashSet.filter(functionsRemoved, (fp) =>
                            Equal.equals(fp.groupPath, gp),
                          ),
                        ),
                        logFunctionRemovedIndented,
                      );
                    }),
                  );

                  // Added groups
                  yield* writeGroups(spec, groupsAdded);
                  yield* Effect.forEach(groupsAdded, (gp) =>
                    Effect.gen(function* () {
                      const relativeModulePath = GroupPath.modulePath(gp);
                      const filePath = Path.join(
                        convexDirectory,
                        relativeModulePath,
                      );
                      yield* logFileChangeIndented("Added", filePath);
                      yield* Effect.forEach(
                        Array.fromIterable(
                          HashSet.filter(functionsAdded, (fp) =>
                            Equal.equals(fp.groupPath, gp),
                          ),
                        ),
                        logFunctionAddedIndented,
                      );
                    }),
                  );

                  // Changed groups
                  yield* writeGroups(spec, groupsChanged);
                  yield* Effect.forEach(groupsChanged, (gp) =>
                    Effect.gen(function* () {
                      const relativeModulePath = GroupPath.modulePath(gp);
                      const filePath = Path.join(
                        convexDirectory,
                        relativeModulePath,
                      );
                      yield* logFileChangeIndented("Modified", filePath);
                      yield* Effect.forEach(
                        Array.fromIterable(
                          HashSet.filter(functionsAdded, (fp) =>
                            Equal.equals(fp.groupPath, gp),
                          ),
                        ),
                        logFunctionAddedIndented,
                      );
                      yield* Effect.forEach(
                        Array.fromIterable(
                          HashSet.filter(functionsRemoved, (fp) =>
                            Equal.equals(fp.groupPath, gp),
                          ),
                        ),
                        logFunctionRemovedIndented,
                      );
                    }),
                  );

                  yield* Ref.set(functionPathsRef, current);

                  return Option.some<void>(undefined);
                }),
              ),
              Effect.catchTag("SpecImportFailedError", () =>
                logFailure("Spec import failed").pipe(
                  Effect.as(Option.none<void>()),
                ),
              ),
              Effect.catchTag("SpecFileDoesNotExportSpecError", () =>
                logFailure(
                  "Spec file does not default export a Convex spec",
                ).pipe(Effect.as(Option.none<void>())),
              ),
              Effect.catchTag("NodeSpecFileDoesNotExportSpecError", () =>
                logFailure(
                  "Node spec file does not default export a Node spec",
                ).pipe(Effect.as(Option.none<void>())),
              ),
            )
          : Option.some<void>(undefined);

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

        if (dirtyOptionalFiles.length > 0) {
          yield* Effect.all(dirtyOptionalFiles, { concurrency: "unbounded" });
        }

        yield* Option.match(specResult, {
          onSome: () => logSuccess("Generated files are up-to-date"),
          onNone: () => Effect.void,
        });
      }),
    );
  });

const loadSpec = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;
  const specPath = yield* getSpecPath;
  const specModule = yield* bundleAndImport(specPath).pipe(
    Effect.mapError((error) => new SpecImportFailedError({ error })),
  );
  const spec = specModule.default;

  if (!Spec.isConvexSpec(spec)) {
    return yield* new SpecFileDoesNotExportSpecError();
  }

  const nodeImplPath = Path.join(confectDirectory, "nodeImpl.ts");
  const nodeImplExists = yield* Fs.exists(nodeImplPath);
  const nodeSpecOption = yield* loadNodeSpec;
  const mergedSpec = Option.match(nodeSpecOption, {
    onNone: () => spec,
    onSome: (nodeSpec) => (nodeImplExists ? Spec.merge(spec, nodeSpec) : spec),
  });

  return mergedSpec;
});

const getSpecPath = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;
  return Path.join(confectDirectory, "spec.ts");
});

const getNodeSpecPath = Effect.gen(function* () {
  const confectDirectory = yield* findConfectDirectory;
  return Path.join(confectDirectory, "nodeSpec.ts");
});

const loadNodeSpec = Effect.gen(function* () {
  const nodeSpecPath = yield* getNodeSpecPath;

  if (!(yield* Fs.exists(nodeSpecPath))) {
    return Option.none<Spec.AnyWithPropsWithRuntime<"Node">>();
  }

  const nodeSpecModule = yield* bundleAndImport(nodeSpecPath).pipe(
    Effect.mapError((error) => new SpecImportFailedError({ error })),
  );
  const nodeSpec = nodeSpecModule.default;

  if (!Spec.isNodeSpec(nodeSpec)) {
    return yield* new NodeSpecFileDoesNotExportSpecError();
  }

  return Option.some(nodeSpec as Spec.AnyWithPropsWithRuntime<"Node">);
});

const esbuildOptions = (entryPoint: string) => ({
  entryPoints: [entryPoint],
  bundle: true,
  write: false,
  metafile: true,
  platform: "node" as const,
  format: "esm" as const,
  logLevel: "silent" as const,
  external: EXTERNAL_PACKAGES,
  plugins: [
    {
      name: "notify-rebuild",
      setup(build: esbuild.PluginBuild) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            (build as { _emit?: (v: void) => void })._emit?.();
          } else {
            Effect.runPromise(
              Effect.gen(function* () {
                const formattedMessages = yield* Effect.promise(() =>
                  esbuild.formatMessages(result.errors, {
                    kind: "error",
                    color: true,
                    terminalWidth: 80,
                  }),
                );
                const output = formatBuildErrors(
                  result.errors,
                  formattedMessages,
                );
                yield* Console.error("\n" + output + "\n");
                yield* logFailure("Build errors found");
              }),
            );
          }
        });
      },
    },
  ],
});

const createSpecWatcher = (entryPoint: string): Stream.Stream<void, never> =>
  Stream.callback<void>(
    (queue) =>
      Effect.acquireRelease(
        Effect.promise(async () => {
          const opts = esbuildOptions(entryPoint);
          const plugin = opts.plugins[0]!;
          const originalSetup = plugin.setup;
          (plugin as { setup: (build: esbuild.PluginBuild) => void }).setup = (
            build,
          ) => {
            (build as { _emit?: (v: void) => void })._emit = () => {
              Queue.offerUnsafe(queue, undefined);
            };
            return originalSetup(build);
          };

          const ctx = await esbuild.context({
            ...opts,
            plugins: [plugin],
          });

          await ctx.watch();
          return ctx;
        }),
        (ctx) =>
          Effect.promise(() => ctx.dispose()).pipe(
            Effect.tap(() => Effect.logDebug("esbuild watcher disposed")),
          ),
      ),
    { bufferSize: 1, strategy: "sliding" },
  );

type SpecWatcherEvent = "change" | "restart";

const specFileWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  specWatcherRestartQueue: Queue.Queue<void>,
) =>
  Effect.forever(
    Effect.gen(function* () {
      const specPath = yield* getSpecPath;
      const nodeSpecPath = yield* getNodeSpecPath;
      const nodeSpecExists = yield* Fs.exists(nodeSpecPath);

      const specWatcher = createSpecWatcher(specPath);
      const nodeSpecWatcher = nodeSpecExists
        ? createSpecWatcher(nodeSpecPath)
        : Stream.empty;

      const specChanges: Stream.Stream<SpecWatcherEvent, never> = pipe(
        Stream.merge(specWatcher, nodeSpecWatcher),
        Stream.map((): SpecWatcherEvent => "change"),
      );
      const restartStream: Stream.Stream<SpecWatcherEvent, never> = pipe(
        Stream.fromQueue(specWatcherRestartQueue),
        Stream.map((): SpecWatcherEvent => "restart"),
      );

      yield* pipe(
        Stream.merge(specChanges, restartStream),
        Stream.debounce(Duration.millis(200)),
        Stream.takeUntil((event) => event === "restart"),
        Stream.runForEach((event) =>
          event === "change"
            ? Ref.update(pendingRef, (p) => ({
                ...p,
                specDirty: true,
              })).pipe(Effect.andThen(Queue.offer(signal, undefined)))
            : Effect.void,
        ),
      );
    }),
  );

const formatBuildError = (
  error: esbuild.Message | undefined,
  formattedMessage: string,
): string => {
  const lines: ReadonlyArray<string> = String.split(formattedMessage, "\n");
  const redErrorText = colors.red(error?.text ?? "");
  const replaced: ReadonlyArray<string> = pipe(
    Array.findFirstIndex(lines, (l) => pipe(l, String.trim, String.isNonEmpty)),
    Option.flatMap((index) => Array.modify(lines, index, () => redErrorText)),
    Option.getOrElse((): ReadonlyArray<string> => lines),
  );
  return Array.join(replaced, "\n");
};

const formatBuildErrors = (
  errors: readonly esbuild.Message[],
  formattedMessages: readonly string[],
): string =>
  pipe(
    formattedMessages,
    Array.map((message, i) => formatBuildError(errors[i], message)),
    Array.join(""),
    String.trimEnd,
  );

export class SpecFileDoesNotExportSpecError extends Schema.TaggedErrorClass<SpecFileDoesNotExportSpecError>()(
  "SpecFileDoesNotExportSpecError",
  {},
) {}

export class NodeSpecFileDoesNotExportSpecError extends Schema.TaggedErrorClass<NodeSpecFileDoesNotExportSpecError>()(
  "NodeSpecFileDoesNotExportSpecError",
  {},
) {}

export class SpecImportFailedError extends Schema.TaggedErrorClass<SpecImportFailedError>()(
  "SpecImportFailedError",
  {
    error: Schema.Unknown,
  },
) {}

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
            const convexDirectory = yield* findConvexDirectory;
            const convexFilePath = Path.join(convexDirectory, convexFile);

            if (yield* Fs.exists(convexFilePath)) {
              yield* Fs.remove(convexFilePath);
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
  "nodeSpec.ts": "specDirty",
  "nodeImpl.ts": "nodeImplDirty",
};

const confectDirectoryWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  specWatcherRestartQueue: Queue.Queue<void>,
) =>
  Effect.gen(function* () {
    const confectDirectory = yield* findConfectDirectory;

    yield* pipe(
      Fs.watch(confectDirectory),
      Stream.runForEach((event: Fs.WatchEvent) => {
        const basename = Path.basename(event.path);
        const pendingKey = optionalConfectFiles[basename];

        if (pendingKey !== undefined) {
          return pipe(
            pendingRef,
            Ref.update((p) => {
              const next = { ...p, [pendingKey]: true };
              if (basename === "nodeImpl.ts") {
                return { ...next, specDirty: true };
              }
              return next;
            }),
            Effect.andThen(Queue.offer(signal, undefined)),
            Effect.andThen(
              basename === "nodeSpec.ts"
                ? Queue.offer(specWatcherRestartQueue, undefined)
                : Effect.void,
            ),
          );
        }
        return Effect.void;
      }),
    );
  });
