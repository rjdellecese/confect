import type { FunctionSpec } from "@confect/core";
import { Spec } from "@confect/core";
import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import {
  Array,
  Console,
  Duration,
  Effect,
  Function,
  HashSet,
  Option,
  Order,
  pipe,
  Queue,
  Record,
  Ref,
  Schema,
  Stream,
} from "effect";
import * as tsx from "tsx/esm/api";
import * as FunctionPaths from "../FunctionPaths";
import * as GroupPath from "../GroupPath";
import * as GroupPaths from "../GroupPaths";
import { ConfectDirectory } from "../services/ConfectDirectory";
import { ConvexDirectory } from "../services/ConvexDirectory";
import * as templates from "../templates";
import { removePathExtension } from "../utils";

export const dev = Command.make("dev", {}, () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // TODO: Create a service which caches the locations of these values (and updates them when they change?)
    const confectDirectory = yield* ConfectDirectory.get;

    // Ensure that all required Confect files are present and export the correct values before trying to do any codegen:
    // - schema.ts
    // - spec.ts
    // - impl.ts
    // For any other Confect files (like http.ts) which are optional, if they are present, still verify that they export the correct values.
    // For optional Confect files which are not present, ensure their corresponding files in Convex are also not present. If they are, remove them.

    // Keep track of the Confect functions in-memory after startup and only write files if they change.
    // Import Impl to ensure it typechecks and is finalized, and get the spec from the api it contains and compare the spec paths to determine whether or not to regenerate any files.

    /**
     * Single-flighting: Uses a sliding queue of capacity 1 to conflate file change events that occur while processing is in progress.
     */
    const queue = yield* Queue.sliding<void>(1);

    const producer = pipe(
      fs.watch(confectDirectory, { recursive: true }),
      Stream.debounce(Duration.millis(200)),
      Stream.runForEach(() => Queue.offer(queue, undefined)),
    );

    yield* Console.debug("Performing initial group sync…");
    const initConsumer = Effect.iterate(
      Option.none<FunctionPaths.FunctionPaths>(),
      {
        while: Option.isNone,
        body: () =>
          performInitialGroupSync.pipe(
            Effect.map(Option.some),
            Effect.catchTag(
              "SpecImportFailedError",
              Function.constant(
                Effect.gen(function* () {
                  yield* Console.debug("Spec import failed");
                  return yield* Effect.succeed(
                    Option.none<FunctionPaths.FunctionPaths>(),
                  );
                }),
              ),
            ),
            Effect.catchTag(
              "SpecFileDoesNotExportSpecError",
              Function.constant(
                Effect.gen(function* () {
                  yield* Console.debug("Spec file does not export spec");
                  return yield* Effect.succeed(
                    Option.none<FunctionPaths.FunctionPaths>(),
                  );
                }),
              ),
            ),
            Effect.andThen(
              Option.match({
                onSome: (functionPaths) =>
                  Effect.succeed(Option.some(functionPaths)),
                onNone: Effect.fn(function* () {
                  yield* Queue.take(queue);
                  return Option.none<FunctionPaths.FunctionPaths>();
                }),
              }),
            ),
          ),
      },
    );

    const watchConsumer = Effect.fn(function* (
      initialFunctionPaths: FunctionPaths.FunctionPaths,
    ) {
      const functionPathsRef = yield* Ref.make(initialFunctionPaths);

      return yield* Effect.forever(
        Effect.gen(function* () {
          yield* Console.debug("Running watch consumer…");
          yield* Queue.take(queue);

          yield* Console.debug("Reloading spec…");
          yield* loadSpec
            .pipe(
              Effect.andThen(
                Effect.fn(function* (spec: Spec.AnyWithProps) {
                  yield* Console.debug("Spec reloaded");

                  const currentFunctionPaths = yield* getCurrentFunctionPaths;
                  const previousFunctionPaths =
                    yield* Ref.get(functionPathsRef);

                  const { groupsRemoved, groupsAdded, groupsChanged } =
                    FunctionPaths.diff(
                      previousFunctionPaths,
                      currentFunctionPaths,
                    );
                  yield* Console.debug(`Groups removed: ${groupsRemoved}`);
                  yield* Console.debug(`Groups added: ${groupsAdded}`);
                  yield* Console.debug(`Groups changed: ${groupsChanged}`);

                  yield* removeGroups(groupsRemoved);
                  yield* writeGroups(spec, groupsAdded);
                  yield* writeGroups(spec, groupsChanged);

                  yield* Ref.set(functionPathsRef, currentFunctionPaths);
                }),
              ),
            )
            .pipe(
              Effect.catchTag(
                "SpecImportFailedError",
                Function.constant(Console.debug("Spec import failed")),
              ),
              Effect.catchTag(
                "SpecFileDoesNotExportSpecError",
                Function.constant(
                  Console.debug("Spec file does not export spec"),
                ),
              ),
            );
        }),
      );
    });

    const consumer = initConsumer.pipe(
      Effect.map(Option.getOrThrow),
      Effect.andThen(watchConsumer),
    );

    yield* Effect.all([producer, consumer], {
      concurrency: "unbounded",
    });
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const performInitialGroupSync = Effect.gen(function* () {
  const spec = yield* loadSpec;
  const groupPathsFromFs = yield* getGroupPathsFromFs;
  const functionPaths = FunctionPaths.make(spec);
  const groupPathsFromSpec = FunctionPaths.groupPaths(functionPaths);

  const overlappingGroupPaths = GroupPaths.GroupPaths.make(
    HashSet.intersection(groupPathsFromFs, groupPathsFromSpec),
  );
  yield* writeGroups(spec, overlappingGroupPaths);

  const extinctGroupPaths = GroupPaths.GroupPaths.make(
    HashSet.difference(groupPathsFromFs, groupPathsFromSpec),
  );
  yield* removeGroups(extinctGroupPaths);

  const newGroupPaths = GroupPaths.GroupPaths.make(
    HashSet.difference(groupPathsFromSpec, groupPathsFromFs),
  );
  yield* writeGroups(spec, newGroupPaths);

  return functionPaths;
});

const getGroupPathsFromFs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;

  const RESERVED_CONVEX_TS_FILE_NAMES = new Set([
    "schema.ts",
    "http.ts",
    "crons.ts",
    "auth.config.ts",
    "convex.config.ts",
  ]);

  const allConvexPaths = yield* fs.readDirectory(convexDirectory, {
    recursive: true,
  });
  const groupPathArray = yield* pipe(
    allConvexPaths,
    Array.filter(
      (convexPath) =>
        path.extname(convexPath) === ".ts" &&
        !RESERVED_CONVEX_TS_FILE_NAMES.has(path.basename(convexPath)) &&
        path.basename(path.dirname(convexPath)) !== "_generated",
    ),
    Effect.forEach((groupModulePath) =>
      GroupPath.fromGroupModulePath(groupModulePath),
    ),
  );
  return pipe(groupPathArray, HashSet.fromIterable, GroupPaths.GroupPaths.make);
});

const removeGroups = (groupPaths: GroupPaths.GroupPaths) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const convexDirectory = yield* ConvexDirectory.get;

    yield* Effect.all(
      HashSet.map(groupPaths, (groupPath) =>
        Effect.gen(function* () {
          const relativeModulePath = yield* GroupPath.modulePath(groupPath);
          const modulePath = path.join(convexDirectory, relativeModulePath);

          yield* Console.debug(`Removing group '${relativeModulePath}'…`);

          yield* fs.remove(modulePath);
          yield* Console.debug(`Group '${relativeModulePath}' removed`);
        }),
      ),
    );
  });

const writeGroups = (
  spec: Spec.AnyWithProps,
  groupPaths: GroupPaths.GroupPaths,
) =>
  Effect.forEach(groupPaths, (groupPath) =>
    Effect.gen(function* () {
      const group = yield* GroupPath.getGroupSpec(spec, groupPath);

      const functions = pipe(
        group.functions,
        Record.values,
        Array.sortBy(
          Order.mapInput(
            Order.string,
            (fn: FunctionSpec.AnyWithProps) => fn.name,
          ),
        ),
      );

      yield* Console.debug(`Generating group ${groupPath}…`);
      yield* generateGroupModule({
        groupPath,
        functions,
      });
      yield* Console.debug(`Group ${groupPath} generated`);
    }),
  );

const generateGroupModule = ({
  groupPath,
  functions,
}: {
  groupPath: GroupPath.GroupPath;
  functions: Array<FunctionSpec.AnyWithProps>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const convexDirectory = yield* ConvexDirectory.get;
    const confectDirectory = yield* ConfectDirectory.get;

    const relativeModulePath = yield* GroupPath.modulePath(groupPath);
    const modulePath = path.join(convexDirectory, relativeModulePath);

    const directoryPath = path.dirname(modulePath);
    if (!(yield* fs.exists(directoryPath))) {
      yield* fs.makeDirectory(directoryPath, { recursive: true });
    }

    const registeredFunctionsPath = path.join(
      confectDirectory,
      "_generated",
      "registeredFunctions.ts",
    );
    const registeredFunctionsImportPath = yield* removePathExtension(
      path.relative(path.dirname(modulePath), registeredFunctionsPath),
    );

    const functionNames = Array.map(functions, (fn) => fn.name);

    const functionsContentsString = yield* templates.functions_({
      groupPath,
      functionNames,
      registeredFunctionsImportPath,
    });

    const moduleContents = new TextEncoder().encode(functionsContentsString);
    yield* fs.writeFile(modulePath, moduleContents);
  });

const getCurrentFunctionPaths = Effect.gen(function* () {
  const spec = yield* loadSpec;

  return FunctionPaths.make(spec);
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

export class SpecFileDoesNotExportSpecError extends Schema.TaggedError<SpecFileDoesNotExportSpecError>(
  "SpecFileDoesNotExportSpecError",
)("SpecFileDoesNotExportSpecError", {}) {
  override get message(): string {
    return "The spec.ts file does not export a Spec";
  }
}

export class SpecImportFailedError extends Schema.TaggedError<SpecImportFailedError>(
  "SpecImportFailedError",
)("SpecImportFailedError", {
  error: Schema.Unknown,
}) {}
