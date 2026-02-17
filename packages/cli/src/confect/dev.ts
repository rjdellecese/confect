import { Spec } from "@confect/core";
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
  Schema,
  Stream,
  String,
} from "effect";
import type { ReadonlyRecord } from "effect/Record";
import * as esbuild from "esbuild";
import * as tsx from "tsx/esm/api";
import type * as FunctionPath from "../FunctionPath";
import * as FunctionPaths from "../FunctionPaths";
import * as GroupPath from "../GroupPath";
import { logFailure, logPending, logSuccess } from "../log";
import { ConfectDirectory } from "../services/ConfectDirectory";
import { ConvexDirectory } from "../services/ConvexDirectory";
import { ProjectRoot } from "../services/ProjectRoot";
import {
  generateAuthConfig,
  generateConvexConfig,
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
  readonly appDirty: boolean;
  readonly cronsDirty: boolean;
  readonly authDirty: boolean;
};

const pendingInit: Pending = {
  specDirty: false,
  nodeImplDirty: false,
  httpDirty: false,
  appDirty: false,
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

const logFunctionAddedIndented = (functionPath: FunctionPath.FunctionPath) =>
  Console.log(
    pipe(
      AnsiDoc.text("  "),
      AnsiDoc.cat(pipe(AnsiDoc.char("+"), AnsiDoc.annotate(Ansi.green))),
      AnsiDoc.catWithSpace(
        AnsiDoc.hcat([
          pipe(
            AnsiDoc.text(GroupPath.toString(functionPath.groupPath) + "."),
            AnsiDoc.annotate(Ansi.blackBright),
          ),
          pipe(AnsiDoc.text(functionPath.name), AnsiDoc.annotate(Ansi.green)),
        ]),
      ),
      AnsiDoc.render({ style: "pretty" }),
    ),
  );

const logFunctionRemovedIndented = (functionPath: FunctionPath.FunctionPath) =>
  Console.log(
    pipe(
      AnsiDoc.text("  "),
      AnsiDoc.cat(pipe(AnsiDoc.char("-"), AnsiDoc.annotate(Ansi.red))),
      AnsiDoc.catWithSpace(
        AnsiDoc.hcat([
          pipe(
            AnsiDoc.text(GroupPath.toString(functionPath.groupPath) + "."),
            AnsiDoc.annotate(Ansi.blackBright),
          ),
          pipe(AnsiDoc.text(functionPath.name), AnsiDoc.annotate(Ansi.red)),
        ]),
      ),
      AnsiDoc.render({ style: "pretty" }),
    ),
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
        yield* Effect.when(
          logPending("Dependencies changed, reloading…"),
          () => isDone,
        );
        yield* Deferred.succeed(initialSyncDone, undefined);

        const pending = yield* Ref.getAndSet(pendingRef, pendingInit);

        if (pending.specDirty || pending.nodeImplDirty) {
          yield* generateNodeApi;
          yield* generateNodeRegisteredFunctions;
        }

        const specResult: Option.Option<void> = yield* Effect.if(
          pending.specDirty,
          {
            onTrue: () =>
              loadSpec.pipe(
                Effect.andThen(
                  Effect.fn(function* (spec) {
                    yield* Effect.logDebug("Spec loaded");

                    const previous = yield* Ref.get(functionPathsRef);

                    const path = yield* Path.Path;
                    const convexDirectory = yield* ConvexDirectory.get;

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
                        const relativeModulePath =
                          yield* GroupPath.modulePath(gp);
                        const filePath = path.join(
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
                        const relativeModulePath =
                          yield* GroupPath.modulePath(gp);
                        const filePath = path.join(
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
                        const relativeModulePath =
                          yield* GroupPath.modulePath(gp);
                        const filePath = path.join(
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

                    return Option.some(undefined);
                  }),
                ),
                Effect.catchTag("SpecImportFailedError", () =>
                  logFailure("Spec import failed").pipe(
                    Effect.as(Option.none()),
                  ),
                ),
                Effect.catchTag("SpecFileDoesNotExportSpecError", () =>
                  logFailure(
                    "Spec file does not default export a Convex spec",
                  ).pipe(Effect.as(Option.none())),
                ),
                Effect.catchTag("NodeSpecFileDoesNotExportSpecError", () =>
                  logFailure(
                    "Node spec file does not default export a Node spec",
                  ).pipe(Effect.as(Option.none())),
                ),
              ),
            onFalse: () => Effect.succeed(Option.some(undefined)),
          },
        );

        const dirtyOptionalFiles = [
          ...(pending.httpDirty
            ? [syncOptionalFile(generateHttp, "http.ts")]
            : []),
          ...(pending.appDirty
            ? [syncOptionalFile(generateConvexConfig, "convex.config.ts")]
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

        yield* Option.match(specResult, {
          onSome: () => logSuccess("Generated files are up-to-date"),
          onNone: () => Effect.void,
        });
      }),
    );
  });

const loadSpec = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const specPathUrl = yield* path.toFileUrl(yield* getSpecPath);
  const specModule = yield* Effect.tryPromise({
    try: () => tsx.tsImport(specPathUrl.href, import.meta.url),
    catch: (error) => new SpecImportFailedError({ error }),
  });
  const spec = specModule.default;

  if (!Spec.isConvexSpec(spec)) {
    return yield* new SpecFileDoesNotExportSpecError();
  }

  const nodeImplPath = path.join(confectDirectory, "nodeImpl.ts");
  const nodeImplExists = yield* fs.exists(nodeImplPath);
  const nodeSpecOption = yield* loadNodeSpec;
  const mergedSpec = Option.match(nodeSpecOption, {
    onNone: () => spec,
    onSome: (nodeSpec) => (nodeImplExists ? Spec.merge(spec, nodeSpec) : spec),
  });

  return mergedSpec;
});

const getSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  return path.join(confectDirectory, "spec.ts");
});

const getNodeSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  return path.join(confectDirectory, "nodeSpec.ts");
});

const loadNodeSpec = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const nodeSpecPath = yield* getNodeSpecPath;

  if (!(yield* fs.exists(nodeSpecPath))) {
    return Option.none();
  }

  const nodeSpecPathUrl = yield* path.toFileUrl(nodeSpecPath);
  const nodeSpecModule = yield* Effect.tryPromise({
    try: () => tsx.tsImport(nodeSpecPathUrl.href, import.meta.url),
    catch: (error) => new SpecImportFailedError({ error }),
  });
  const nodeSpec = nodeSpecModule.default;

  if (!Spec.isNodeSpec(nodeSpec)) {
    return yield* new NodeSpecFileDoesNotExportSpecError();
  }

  return Option.some(nodeSpec);
});

const esbuildOptions = (entryPoint: string) => ({
  entryPoints: [entryPoint],
  bundle: true,
  write: false,
  metafile: true,
  platform: "node" as const,
  format: "esm" as const,
  logLevel: "silent" as const,
  external: ["@confect/core", "@confect/server", "effect", "@effect/*"],
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

const createSpecWatcher = (entryPoint: string) =>
  Stream.asyncPush<void>(
    (emit) =>
      Effect.acquireRelease(
        Effect.promise(async () => {
          const opts = esbuildOptions(entryPoint);
          const plugin = opts.plugins[0];
          const originalSetup = plugin!.setup!;
          (plugin as { setup: (build: esbuild.PluginBuild) => void }).setup = (
            build,
          ) => {
            (build as { _emit?: (v: void) => void })._emit = () =>
              emit.single();
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
      const fs = yield* FileSystem.FileSystem;
      const specPath = yield* getSpecPath;
      const nodeSpecPath = yield* getNodeSpecPath;
      const nodeSpecExists = yield* fs.exists(nodeSpecPath);

      const specWatcher = createSpecWatcher(specPath);
      const nodeSpecWatcher = nodeSpecExists
        ? createSpecWatcher(nodeSpecPath)
        : Stream.empty;

      const specChanges = pipe(
        Stream.merge(specWatcher, nodeSpecWatcher),
        Stream.map((): SpecWatcherEvent => "change"),
      );
      const restartStream = pipe(
        Stream.fromQueue(specWatcherRestartQueue),
        Stream.map((): SpecWatcherEvent => "restart"),
      );

      yield* pipe(
        Stream.merge(specChanges, restartStream),
        Stream.debounce(Duration.millis(200)),
        Stream.takeUntil((event): event is "restart" => event === "restart"),
        Stream.runForEach((event) =>
          event === "change"
            ? Ref.update(pendingRef, (pending) => ({
                ...pending,
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
  const lines = String.split(formattedMessage, "\n");
  const redErrorText = pipe(
    AnsiDoc.text(error?.text ?? ""),
    AnsiDoc.annotate(Ansi.red),
    AnsiDoc.render({ style: "pretty" }),
  );
  const replaced = pipe(
    Array.findFirstIndex(lines, (l) => pipe(l, String.trim, String.isNonEmpty)),
    Option.match({
      onNone: () => lines,
      onSome: (index) => Array.modify(lines, index, () => redErrorText),
    }),
  );
  return pipe(replaced, Array.join("\n"));
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

export class SpecFileDoesNotExportSpecError extends Schema.TaggedError<SpecFileDoesNotExportSpecError>()(
  "SpecFileDoesNotExportSpecError",
  {},
) {}

export class NodeSpecFileDoesNotExportSpecError extends Schema.TaggedError<NodeSpecFileDoesNotExportSpecError>()(
  "NodeSpecFileDoesNotExportSpecError",
  {},
) {}

export class SpecImportFailedError extends Schema.TaggedError<SpecImportFailedError>()(
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
  "app.ts": "appDirty",
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
            Ref.update((pending) => {
              const next = { ...pending, [pendingKey]: true };
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
