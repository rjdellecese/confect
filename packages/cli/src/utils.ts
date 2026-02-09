import type { FunctionSpec, Spec } from "@confect/core";
import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import {
  Array,
  Effect,
  HashSet,
  Option,
  Order,
  pipe,
  Record,
  String,
} from "effect";
import * as FunctionPaths from "./FunctionPaths";
import * as GroupPath from "./GroupPath";
import * as GroupPaths from "./GroupPaths";
import { logFileAdded, logFileModified, logFileRemoved } from "./log";
import { ConfectDirectory } from "./services/ConfectDirectory";
import { ConvexDirectory } from "./services/ConvexDirectory";
import * as templates from "./templates";

export const removePathExtension = (pathStr: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return String.slice(0, -path.extname(pathStr).length)(pathStr);
  });

export const writeFileStringAndLog = (filePath: string, contents: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(filePath))) {
      yield* fs.writeFileString(filePath, contents);
      yield* logFileAdded(filePath);
      return;
    }
    const existing = yield* fs.readFileString(filePath);
    if (existing !== contents) {
      yield* fs.writeFileString(filePath, contents);
      yield* logFileModified(filePath);
    }
  });

export const findProjectRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const startDir = path.resolve(".");
  const root = path.parse(startDir).root;

  const directories = Array.unfold(startDir, (dir) =>
    dir === root
      ? Option.none()
      : Option.some([dir, path.dirname(dir)] as const),
  );

  const projectRoot = yield* Effect.findFirst(directories, (dir) =>
    fs.exists(path.join(dir, "package.json")),
  );

  return Option.getOrElse(projectRoot, () => startDir);
});

export type WriteChange = "Added" | "Modified" | "Unchanged";

export const writeFileString = (
  filePath: string,
  contents: string,
): Effect.Effect<WriteChange, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (!(yield* fs.exists(filePath))) {
      yield* fs.writeFileString(filePath, contents);
      return "Added";
    }
    const existing = yield* fs.readFileString(filePath);
    if (existing !== contents) {
      yield* fs.writeFileString(filePath, contents);
      return "Modified";
    }
    return "Unchanged";
  });

export const generateGroupModule = ({
  groupPath,
  functionNames,
}: {
  groupPath: GroupPath.GroupPath;
  functionNames: string[];
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

    const functionsContentsString = yield* templates.functions({
      groupPath,
      functionNames,
      registeredFunctionsImportPath,
    });

    if (!(yield* fs.exists(modulePath))) {
      yield* fs.writeFileString(modulePath, functionsContentsString);
      return "Added" as const;
    }
    const existing = yield* fs.readFileString(modulePath);
    if (existing !== functionsContentsString) {
      yield* fs.writeFileString(modulePath, functionsContentsString);
      return "Modified" as const;
    }
    return "Unchanged" as const;
  });

const logGroupPaths = <R>(
  groupPaths: GroupPaths.GroupPaths,
  logFn: (fullPath: string) => Effect.Effect<void, never, R>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const convexDirectory = yield* ConvexDirectory.get;

    yield* Effect.forEach(groupPaths, (gp) =>
      Effect.gen(function* () {
        const relativeModulePath = yield* GroupPath.modulePath(gp);
        yield* logFn(path.join(convexDirectory, relativeModulePath));
      }),
    );
  });

export const generateFunctions = (spec: Spec.AnyWithProps) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const convexDirectory = yield* ConvexDirectory.get;

    const groupPathsFromFs = yield* getGroupPathsFromFs;
    const functionPaths = FunctionPaths.make(spec);
    const groupPathsFromSpec = FunctionPaths.groupPaths(functionPaths);

    const overlappingGroupPaths = GroupPaths.GroupPaths.make(
      HashSet.intersection(groupPathsFromFs, groupPathsFromSpec),
    );
    yield* Effect.forEach(overlappingGroupPaths, (groupPath) =>
      Effect.gen(function* () {
        const group = yield* GroupPath.getGroupSpec(spec, groupPath);
        const functionNames = pipe(
          group.functions,
          Record.values,
          Array.sortBy(
            Order.mapInput(
              Order.string,
              (fn: FunctionSpec.AnyWithProps) => fn.name,
            ),
          ),
          Array.map((fn) => fn.name),
        );
        const result = yield* generateGroupModule({ groupPath, functionNames });
        if (result === "Modified") {
          const relativeModulePath = yield* GroupPath.modulePath(groupPath);
          yield* logFileModified(
            path.join(convexDirectory, relativeModulePath),
          );
        }
      }),
    );

    const extinctGroupPaths = GroupPaths.GroupPaths.make(
      HashSet.difference(groupPathsFromFs, groupPathsFromSpec),
    );
    yield* removeGroups(extinctGroupPaths);
    yield* logGroupPaths(extinctGroupPaths, logFileRemoved);

    const newGroupPaths = GroupPaths.GroupPaths.make(
      HashSet.difference(groupPathsFromSpec, groupPathsFromFs),
    );
    yield* writeGroups(spec, newGroupPaths);
    yield* logGroupPaths(newGroupPaths, logFileAdded);

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

export const removeGroups = (groupPaths: GroupPaths.GroupPaths) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const convexDirectory = yield* ConvexDirectory.get;

    yield* Effect.all(
      HashSet.map(groupPaths, (groupPath) =>
        Effect.gen(function* () {
          const relativeModulePath = yield* GroupPath.modulePath(groupPath);
          const modulePath = path.join(convexDirectory, relativeModulePath);

          yield* Effect.logDebug(`Removing group '${relativeModulePath}'...`);

          yield* fs.remove(modulePath);
          yield* Effect.logDebug(`Group '${relativeModulePath}' removed`);
        }),
      ),
      { concurrency: "unbounded" },
    );
  });

export const writeGroups = (
  spec: Spec.AnyWithProps,
  groupPaths: GroupPaths.GroupPaths,
) =>
  Effect.forEach(groupPaths, (groupPath) =>
    Effect.gen(function* () {
      const group = yield* GroupPath.getGroupSpec(spec, groupPath);

      const functionNames = pipe(
        group.functions,
        Record.values,
        Array.sortBy(
          Order.mapInput(
            Order.string,
            (fn: FunctionSpec.AnyWithProps) => fn.name,
          ),
        ),
        Array.map((fn) => fn.name),
      );

      yield* Effect.logDebug(`Generating group ${groupPath}...`);
      yield* generateGroupModule({
        groupPath,
        functionNames,
      });
      yield* Effect.logDebug(`Group ${groupPath} generated`);
    }),
  );
