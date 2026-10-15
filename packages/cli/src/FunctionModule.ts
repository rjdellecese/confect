import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as GenerationSnapshot from "./GenerationSnapshot";
import * as GroupPath from "./GroupPath";
import * as GroupPaths from "./GroupPaths";
import { CodeBlockWriter } from "./CodeBlockWriter";
import { logFileAdded, logFileModified, logFileRemoved } from "./log";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { removePathIfExists, toModuleImportPath } from "./utils";

export const render = ({
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: Parameters<typeof renderEffect>[0]) =>
  renderEffect({ functionNames, registeredFunctionsImportPath, useNode });

const renderEffect = Effect.fnUntraced(function* ({
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: {
  functionNames: ReadonlyArray<string>;
  registeredFunctionsImportPath: string;
  useNode?: boolean;
}) {
  const cbw = new CodeBlockWriter({ indentNumberOfSpaces: 2 });

  if (useNode) {
    yield* cbw.writeLine(`"use node";`);
    yield* cbw.blankLine();
  }

  yield* cbw.writeLine(
    `import registeredFunctions from "${registeredFunctionsImportPath}";`,
  );
  yield* cbw.newLine();
  yield* Effect.forEach(functionNames, (name) =>
    cbw.writeLine(`export const ${name} = registeredFunctions.${name};`),
  );

  return yield* cbw.toString();
});

export const generateGroupModule = ({
  groupPath,
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: Parameters<typeof generateGroupModuleEffect>[0]) =>
  generateGroupModuleEffect({
    groupPath,
    functionNames,
    registeredFunctionsImportPath,
    useNode,
  });

const generateGroupModuleEffect = Effect.fnUntraced(function* ({
  groupPath,
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: {
  groupPath: GroupPath.GroupPath;
  functionNames: ReadonlyArray<string>;
  registeredFunctionsImportPath: string;
  useNode?: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;

  const relativeModulePath = yield* GroupPath.modulePath(groupPath);
  const modulePath = path.join(convexDirectory, relativeModulePath);

  const directoryPath = path.dirname(modulePath);
  if (!(yield* fs.exists(directoryPath))) {
    yield* fs.makeDirectory(directoryPath, { recursive: true });
  }

  const functionsContentsString = yield* render({
    functionNames,
    registeredFunctionsImportPath,
    useNode,
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

/**
 * Compute the module import specifier (relative to `modulePath`) for a group's
 * registry file under `confect/_generated/registeredFunctions/`. The registry
 * path mirrors the group's path one-to-one (see
 * `registeredFunctionsRelativePath` in `LeafModule.ts`) for both Convex and
 * Node groups.
 */
export const registeredFunctionsImportPathForGroup = Effect.fnUntraced(
  function* (groupPath: GroupPath.GroupPath, modulePath: string) {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    const registeredFunctionsPath =
      path.join(
        confectDirectory,
        "_generated",
        "registeredFunctions",
        ...groupPath.pathSegments,
      ) + ".ts";

    return yield* toModuleImportPath(
      path.relative(path.dirname(modulePath), registeredFunctionsPath),
    );
  },
);

const logGroupPaths = Effect.fnUntraced(function* <R>(
  groupPaths: GroupPaths.GroupPaths,
  logFn: (fullPath: string) => Effect.Effect<void, never, R>,
): Effect.fn.Return<void, never, R | Path.Path | ConvexDirectory> {
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;

  yield* Effect.forEach(
    groupPaths,
    Effect.fnUntraced(function* (gp: GroupPath.GroupPath) {
      const relativeModulePath = yield* GroupPath.modulePath(gp);
      yield* logFn(path.join(convexDirectory, relativeModulePath));
    }),
  );
});

export const generateFunctions = Effect.fnUntraced(function* (
  snapshot: GenerationSnapshot.GenerationSnapshot,
) {
  const groupPathsFromFs = yield* getGroupPathsFromFs;
  yield* applyFunctionPlan(GenerationSnapshot.plan(snapshot, groupPathsFromFs));
  return GenerationSnapshot.functionPaths(snapshot);
});

export const applyFunctionPlan = Effect.fnUntraced(function* (
  plan: GenerationSnapshot.ModulePlan,
) {
  const removed = GroupPaths.GroupPaths.make(
    HashSet.fromIterable(plan.removed),
  );
  yield* removeGroups(removed);
  yield* logGroupPaths(removed, logFileRemoved);
  yield* writeGroups(plan.changed);
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
  return GroupPaths.GroupPaths.make(HashSet.fromIterable(groupPathArray));
});

export const removeGroups = Effect.fnUntraced(function* (
  groupPaths: GroupPaths.GroupPaths,
) {
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;

  yield* Effect.all(
    HashSet.map(groupPaths, (groupPath) =>
      Effect.gen(function* () {
        const relativeModulePath = yield* GroupPath.modulePath(groupPath);
        const modulePath = path.join(convexDirectory, relativeModulePath);

        yield* Effect.logDebug(`Removing group '${relativeModulePath}'...`);

        yield* removePathIfExists(modulePath);
        yield* Effect.logDebug(`Group '${relativeModulePath}' removed`);
      }),
    ),
    { concurrency: "unbounded" },
  );
});

export const writeGroups = (
  groups: ReadonlyArray<GenerationSnapshot.GroupSummary>,
) =>
  Effect.forEach(
    groups,
    Effect.fnUntraced(function* (group: GenerationSnapshot.GroupSummary) {
      const path = yield* Path.Path;
      const convexDirectory = yield* ConvexDirectory.get;
      const relativeModulePath = yield* GroupPath.modulePath(group.path);
      const modulePath = path.join(convexDirectory, relativeModulePath);
      const registeredFunctionsImportPath =
        yield* registeredFunctionsImportPathForGroup(group.path, modulePath);
      const change = yield* generateGroupModule({
        groupPath: group.path,
        functionNames: group.functionNames,
        registeredFunctionsImportPath,
        useNode: group.runtime === "Node",
      });
      yield* Match.value(change).pipe(
        Match.when("Added", () => logFileAdded(modulePath)),
        Match.when("Modified", () => logFileModified(modulePath)),
        Match.when("Unchanged", () => Effect.void),
        Match.exhaustive,
      );
    }),
  );
