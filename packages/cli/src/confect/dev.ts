import { Spec } from "@confect/core";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import {
  Array,
  Console,
  Data,
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
import * as esbuild from "esbuild";
import * as tsx from "tsx/esm/api";
import type * as FunctionPath from "../FunctionPath";
import * as FunctionPaths from "../FunctionPaths";
import * as GroupPath from "../GroupPath";
import { logCompleted, logFailed } from "../log";
import { ConfectDirectory } from "../services/ConfectDirectory";
import { ConvexDirectory } from "../services/ConvexDirectory";
import { ProjectRoot } from "../services/ProjectRoot";
import * as templates from "../templates";
import {
  removeGroups,
  removePathExtension,
  writeFileString,
  writeGroups,
} from "../utils";
import { codegenHandler } from "./codegen";

type Pending = {
  readonly specDirty: boolean;
  readonly optionalFilesDirty: boolean;
};

type FileChange = Data.TaggedEnum<{
  OptionalFile: {
    readonly change: "Added" | "Removed" | "Modified";
    readonly filePath: string;
  };
  GroupModule: {
    readonly change: "Added" | "Removed" | "Modified";
    readonly filePath: string;
    readonly functionsAdded: ReadonlyArray<FunctionPath.FunctionPath>;
    readonly functionsRemoved: ReadonlyArray<FunctionPath.FunctionPath>;
  };
}>;

const FileChange = Data.taggedEnum<FileChange>();

const logChangeReport = (changes: ReadonlyArray<FileChange>) =>
  Effect.gen(function* () {
    yield* logCompleted("Generated files are up-to-date");

    yield* Effect.when(
      Effect.forEach(changes, (change) =>
        FileChange.$match(change, {
          OptionalFile: ({ change: c, filePath }) =>
            logFileChangeIndented(c, filePath),
          GroupModule: ({
            change: c,
            filePath,
            functionsAdded,
            functionsRemoved,
          }) =>
            Effect.gen(function* () {
              yield* logFileChangeIndented(c, filePath);
              yield* Effect.forEach(functionsAdded, logFunctionAddedIndented);
              yield* Effect.forEach(
                functionsRemoved,
                logFunctionRemovedIndented,
              );
            }),
        }),
      ),
      () => Array.isNonEmptyReadonlyArray(changes),
    );
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
        AnsiDoc.text("  "),
        AnsiDoc.cat(pipe(AnsiDoc.char(char), AnsiDoc.annotate(color))),
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
      AnsiDoc.text("    "),
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
      AnsiDoc.text("    "),
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
    const initialFunctionPaths = yield* codegenHandler;
    // TODO: Create a service which caches the locations of these values (and updates them when they change?)

    // Ensure that all required Confect files are present and export the correct values before trying to do any codegen:
    // - schema.ts
    // - spec.ts
    // - impl.ts
    // For any other Confect files (like http.ts) which are optional, if they are present, still verify that they export the correct values.
    // For optional Confect files which are not present, ensure their corresponding files in Convex are also not present. If they are, remove them.

    const pendingRef = yield* Ref.make<Pending>({
      specDirty: false,
      optionalFilesDirty: false,
    });
    const signal = yield* Queue.sliding<void>(1);

    yield* Effect.all(
      [
        specFileWatcher(signal, pendingRef),
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
    const changesRef = yield* Ref.make<ReadonlyArray<FileChange>>([]);

    return yield* Effect.forever(
      Effect.gen(function* () {
        yield* Effect.logDebug("Running sync loop...");
        yield* Queue.take(signal);

        const pending = yield* Ref.getAndSet(pendingRef, {
          specDirty: false,
          optionalFilesDirty: false,
        });

        const specResult: Option.Option<ReadonlyArray<FileChange>> =
          yield* Effect.if(pending.specDirty, {
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
                    const removedChanges = yield* Effect.forEach(
                      groupsRemoved,
                      (gp) =>
                        Effect.gen(function* () {
                          const relativeModulePath =
                            yield* GroupPath.modulePath(gp);
                          return FileChange.GroupModule({
                            change: "Removed",
                            filePath: path.join(
                              convexDirectory,
                              relativeModulePath,
                            ),
                            functionsAdded: [],
                            functionsRemoved: Array.fromIterable(
                              HashSet.filter(functionsRemoved, (fp) =>
                                Equal.equals(fp.groupPath, gp),
                              ),
                            ),
                          });
                        }),
                    );

                    // Added groups
                    yield* writeGroups(spec, groupsAdded);
                    const addedChanges = yield* Effect.forEach(
                      groupsAdded,
                      (gp) =>
                        Effect.gen(function* () {
                          const relativeModulePath =
                            yield* GroupPath.modulePath(gp);
                          return FileChange.GroupModule({
                            change: "Added",
                            filePath: path.join(
                              convexDirectory,
                              relativeModulePath,
                            ),
                            functionsAdded: Array.fromIterable(
                              HashSet.filter(functionsAdded, (fp) =>
                                Equal.equals(fp.groupPath, gp),
                              ),
                            ),
                            functionsRemoved: [],
                          });
                        }),
                    );

                    // Changed groups
                    yield* writeGroups(spec, groupsChanged);
                    const changedChanges = yield* Effect.forEach(
                      groupsChanged,
                      (gp) =>
                        Effect.gen(function* () {
                          const relativeModulePath =
                            yield* GroupPath.modulePath(gp);
                          return FileChange.GroupModule({
                            change: "Modified",
                            filePath: path.join(
                              convexDirectory,
                              relativeModulePath,
                            ),
                            functionsAdded: Array.fromIterable(
                              HashSet.filter(functionsAdded, (fp) =>
                                Equal.equals(fp.groupPath, gp),
                              ),
                            ),
                            functionsRemoved: Array.fromIterable(
                              HashSet.filter(functionsRemoved, (fp) =>
                                Equal.equals(fp.groupPath, gp),
                              ),
                            ),
                          });
                        }),
                    );

                    yield* Ref.set(functionPathsRef, current);

                    return Option.some([
                      ...removedChanges,
                      ...addedChanges,
                      ...changedChanges,
                    ]);
                  }),
                ),
                Effect.catchTag("SpecImportFailedError", () =>
                  logFailed("Spec import failed").pipe(
                    Effect.as(Option.none()),
                  ),
                ),
                Effect.catchTag("SpecFileDoesNotExportSpecError", () =>
                  logFailed("Spec file does not default export a spec").pipe(
                    Effect.as(Option.none()),
                  ),
                ),
              ),
            onFalse: () => Effect.succeed(Option.some([])),
          });

        const specChanges = Option.getOrElse(specResult, () => []);

        const optionalChanges: ReadonlyArray<FileChange> = yield* Effect.if(
          pending.optionalFilesDirty,
          {
            onTrue: () =>
              Effect.forEach(optionalFileConfigs, syncOptionalFile, {
                concurrency: "unbounded",
              }).pipe(Effect.map(Array.getSomes)),
            onFalse: () => Effect.succeed([]),
          },
        );

        yield* Ref.update(changesRef, (prev) => [
          ...prev,
          ...specChanges,
          ...optionalChanges,
        ]);

        yield* Option.match(specResult, {
          onSome: () =>
            Effect.gen(function* () {
              const pendingSize = yield* Queue.size(signal);
              yield* Effect.when(
                Effect.gen(function* () {
                  const allChanges = yield* Ref.getAndSet(changesRef, []);
                  yield* logChangeReport(allChanges);
                }),
                () => pendingSize === 0,
              );
            }),
          onNone: () => Ref.set(changesRef, []),
        });
      }),
    );
  });

const loadSpec = Effect.gen(function* () {
  const path = yield* Path.Path;
  const specPathUrl = yield* path.toFileUrl(yield* getSpecPath);
  const specModule = yield* Effect.tryPromise({
    try: () => tsx.tsImport(specPathUrl.href, import.meta.url),
    catch: (error) => new SpecImportFailedError({ error }),
  });
  const spec = specModule.default;

  if (Spec.isSpec(spec)) {
    return spec;
  } else {
    return yield* Effect.fail(new SpecFileDoesNotExportSpecError());
  }
});

const getSpecPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;

  return path.join(confectDirectory, "spec.ts");
});

const specFileWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.gen(function* () {
    const specPath = yield* getSpecPath;

    const specChanges: Stream.Stream<void> = Stream.asyncPush(
      (emit) =>
        Effect.acquireRelease(
          Effect.promise(async () => {
            const ctx = await esbuild.context({
              entryPoints: [specPath],
              bundle: true,
              write: false,
              metafile: true,
              platform: "node",
              format: "esm",
              logLevel: "silent",
              external: [
                "@confect/core",
                "@confect/server",
                "effect",
                "@effect/*",
              ],
              plugins: [
                {
                  name: "notify-rebuild",
                  setup(build) {
                    build.onEnd((result) => {
                      if (result.errors.length === 0) {
                        emit.single();
                      } else {
                        Effect.runPromise(
                          Effect.gen(function* () {
                            yield* logFailed("Build errors");
                            const formattedMessages = yield* Effect.promise(
                              () =>
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
                          }),
                        );
                      }
                    });
                  },
                },
              ],
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

    yield* pipe(
      specChanges,
      Stream.debounce(Duration.millis(200)),
      Stream.runForEach(() =>
        Ref.update(pendingRef, (pending) => ({
          ...pending,
          specDirty: true,
        })).pipe(Effect.andThen(Queue.offer(signal, undefined))),
      ),
    );
  });

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
      onSome: (idx) => Array.modify(lines, idx, () => redErrorText),
    }),
  );
  return pipe(
    replaced,
    Array.map((l) => (pipe(l, String.trim, String.isNonEmpty) ? `  ${l}` : l)),
    Array.join("\n"),
  );
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

export class SpecFileDoesNotExportSpecError extends Schema.TaggedError<SpecFileDoesNotExportSpecError>(
  "SpecFileDoesNotExportSpecError",
)("SpecFileDoesNotExportSpecError", {}) {}

export class SpecImportFailedError extends Schema.TaggedError<SpecImportFailedError>(
  "SpecImportFailedError",
)("SpecImportFailedError", {
  error: Schema.Unknown,
}) {}

const optionalFileConfigs = [
  {
    confectFile: "http.ts",
    convexFile: "http.ts",
    generate: (importPath: string) =>
      templates.http({ httpImportPath: importPath }),
  },
  {
    confectFile: "app.ts",
    convexFile: "convex.config.ts",
    generate: (importPath: string) =>
      templates.convexConfig({ appImportPath: importPath }),
  },
  {
    confectFile: "crons.ts",
    convexFile: "crons.ts",
    generate: (importPath: string) =>
      templates.crons({ cronsImportPath: importPath }),
  },
  {
    confectFile: "auth.ts",
    convexFile: "auth.config.ts",
    generate: (importPath: string) =>
      templates.authConfig({ authImportPath: importPath }),
  },
];

const syncOptionalFile = (config: (typeof optionalFileConfigs)[number]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const convexDirectory = yield* ConvexDirectory.get;

    const confectFilePath = path.join(confectDirectory, config.confectFile);
    const convexFilePath = path.join(convexDirectory, config.convexFile);

    if (yield* fs.exists(confectFilePath)) {
      const relativeImportPath = path.relative(
        path.dirname(convexFilePath),
        confectFilePath,
      );
      const importPathWithoutExt =
        yield* removePathExtension(relativeImportPath);
      const contents = yield* config.generate(importPathWithoutExt);

      const result = yield* writeFileString(convexFilePath, contents);
      return result === "Unchanged"
        ? Option.none()
        : Option.some(
            FileChange.OptionalFile({
              change: result,
              filePath: convexFilePath,
            }),
          );
    } else {
      if (yield* fs.exists(convexFilePath)) {
        yield* fs.remove(convexFilePath);
        return Option.some(
          FileChange.OptionalFile({
            change: "Removed",
            filePath: convexFilePath,
          }),
        );
      }
      return Option.none();
    }
  });

const confectDirectoryWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    const implFileName = "impl.ts";
    const schemaFileName = "schema.ts";

    const implPath = path.join(confectDirectory, implFileName);
    const schemaPath = path.join(confectDirectory, schemaFileName);

    const requiredKeyToFileName = {
      doesImplExist: implFileName,
      doesSchemaExist: schemaFileName,
    } satisfies Record<keyof RequiredConfectFiles, string>;

    const initialDoesImplExist = yield* fs.exists(implPath);
    const initialDoesSchemaExist = yield* fs.exists(schemaPath);

    type RequiredConfectFiles = {
      doesImplExist: boolean;
      doesSchemaExist: boolean;
    };

    const requiredConfectFilesRef = yield* Ref.make<RequiredConfectFiles>({
      doesImplExist: initialDoesImplExist,
      doesSchemaExist: initialDoesSchemaExist,
    });

    const processRequiredConfectFile = (key: keyof RequiredConfectFiles) =>
      Effect.gen(function* () {
        const fileName = requiredKeyToFileName[key];
        yield* Effect.logDebug(`Watching ${fileName}...`);

        const doesExist = yield* fs.exists(
          path.join(confectDirectory, fileName),
        );
        yield* Effect.logDebug(`${fileName} does exist: ${doesExist}`);
        const didExist = (yield* Ref.get(requiredConfectFilesRef))[key];
        yield* Effect.logDebug(`${fileName} did exist: ${didExist}`);

        yield* Match.value({ doesExist, didExist }).pipe(
          Match.when({ doesExist: true, didExist: false }, () =>
            logCompleted(`Found ${fileName}`),
          ),
          Match.when({ doesExist: false, didExist: true }, () =>
            logFailed(`Missing ${fileName}`),
          ),
          Match.whenOr(
            { doesExist: true, didExist: true },
            { doesExist: false, didExist: false },
            () => Effect.void,
          ),
          Match.exhaustive,
        );

        yield* Ref.update(requiredConfectFilesRef, (current) => ({
          ...current,
          [key]: doesExist,
        }));
      });

    yield* pipe(
      fs.watch(confectDirectory),
      Stream.runForEach((event) =>
        Match.value(event.path).pipe(
          Match.when(implFileName, () =>
            processRequiredConfectFile("doesImplExist"),
          ),
          Match.when(schemaFileName, () =>
            processRequiredConfectFile("doesSchemaExist"),
          ),
          Match.when(
            (eventPath) =>
              Array.some(
                optionalFileConfigs,
                ({ confectFile }) => confectFile === eventPath,
              ),
            () =>
              Ref.update(pendingRef, (pending) => ({
                ...pending,
                optionalFilesDirty: true,
              })).pipe(Effect.andThen(Queue.offer(signal, undefined))),
          ),
          Match.orElse(() =>
            Effect.logDebug(`Unknown file changed: ${event.path}`),
          ),
        ),
      ),
    );
  });
