import type { FunctionSpec, Spec } from "@confect/core";
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
import * as esbuild from "esbuild";
import { findConfectDirectory } from "./ConfectDirectory";
import { findConvexDirectory } from "./ConvexDirectory";
import * as FunctionPaths from "./FunctionPaths";
import * as GroupPath from "./GroupPath";
import * as GroupPaths from "./GroupPaths";
import * as Fs from "./internal/fs";
import * as Path from "./internal/path";
import { logFileAdded, logFileModified, logFileRemoved } from "./log";
import * as templates from "./templates";

export const removePathExtension = (pathStr: string): string =>
  String.slice(0, -Path.extname(pathStr).length)(pathStr);

export const EXTERNAL_PACKAGES = [
  "@confect/core",
  "@confect/server",
  "effect",
  "@effect/*",
];

const isExternalImport = (path: string) =>
  EXTERNAL_PACKAGES.some((p) => {
    if (p.endsWith("/*")) {
      return path.startsWith(p.slice(0, -1));
    }
    return path === p || path.startsWith(p + "/");
  });

const absoluteExternalsPlugin: esbuild.Plugin = {
  name: "absolute-externals",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind !== "import-statement" && args.kind !== "dynamic-import")
        return;
      if (!isExternalImport(args.path)) return;
      const resolved = import.meta.resolve(
        args.path,
        "file://" + args.resolveDir + "/",
      );
      return { path: resolved, external: true };
    });
  },
};

/**
 * Bundle a TypeScript entry point with esbuild and import the result via a
 * data URL. This handles extensionless `.ts` imports regardless of whether the
 * user's project sets `"type": "module"` in package.json.
 */
export const bundleAndImport = (entryPoint: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.promise(() =>
      esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        logLevel: "silent",
        plugins: [absoluteExternalsPlugin],
      }),
    );
    const code = result.outputFiles[0]!.text;
    const dataUrl =
      "data:text/javascript;base64," + Buffer.from(code).toString("base64");
    return yield* Effect.promise(() => import(dataUrl));
  });

export const writeFileStringAndLog = (filePath: string, contents: string) =>
  Effect.gen(function* () {
    if (!(yield* Fs.exists(filePath))) {
      yield* Fs.writeFileString(filePath, contents);
      yield* logFileAdded(filePath);
      return;
    }
    const existing = yield* Fs.readFileString(filePath);
    if (existing !== contents) {
      yield* Fs.writeFileString(filePath, contents);
      yield* logFileModified(filePath);
    }
  });

export type WriteChange = "Added" | "Modified" | "Unchanged";

export const writeFileString = (
  filePath: string,
  contents: string,
): Effect.Effect<WriteChange, Fs.FsError> =>
  Effect.gen(function* () {
    if (!(yield* Fs.exists(filePath))) {
      yield* Fs.writeFileString(filePath, contents);
      return "Added";
    }
    const existing = yield* Fs.readFileString(filePath);
    if (existing !== contents) {
      yield* Fs.writeFileString(filePath, contents);
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
    const convexDirectory = yield* findConvexDirectory;
    const confectDirectory = yield* findConfectDirectory;

    const relativeModulePath = GroupPath.modulePath(groupPath);
    const modulePath = Path.join(convexDirectory, relativeModulePath);

    const directoryPath = Path.dirname(modulePath);
    if (!(yield* Fs.exists(directoryPath))) {
      yield* Fs.makeDirectory(directoryPath, { recursive: true });
    }

    const isNodeGroup = groupPath.pathSegments[0] === "node";
    const registeredFunctionsFileName = isNodeGroup
      ? "nodeRegisteredFunctions.ts"
      : "registeredFunctions.ts";
    const registeredFunctionsPath = Path.join(
      confectDirectory,
      "_generated",
      registeredFunctionsFileName,
    );
    const registeredFunctionsImportPath = removePathExtension(
      Path.relative(Path.dirname(modulePath), registeredFunctionsPath),
    );
    const registeredFunctionsVariableName = isNodeGroup
      ? "nodeRegisteredFunctions"
      : "registeredFunctions";

    const functionsContentsString = yield* templates.functions({
      groupPath,
      functionNames,
      registeredFunctionsImportPath,
      registeredFunctionsVariableName,
      useNode: isNodeGroup,
      ...(isNodeGroup
        ? {
            registeredFunctionsLookupPath: groupPath.pathSegments.slice(1),
          }
        : {}),
    });

    if (!(yield* Fs.exists(modulePath))) {
      yield* Fs.writeFileString(modulePath, functionsContentsString);
      return "Added" as const;
    }
    const existing = yield* Fs.readFileString(modulePath);
    if (existing !== functionsContentsString) {
      yield* Fs.writeFileString(modulePath, functionsContentsString);
      return "Modified" as const;
    }
    return "Unchanged" as const;
  });

const logGroupPaths = <E, R>(
  groupPaths: GroupPaths.GroupPaths,
  logFn: (fullPath: string) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    const convexDirectory = yield* findConvexDirectory;

    yield* Effect.forEach(groupPaths, (gp) =>
      Effect.gen(function* () {
        const relativeModulePath = GroupPath.modulePath(gp);
        yield* logFn(Path.join(convexDirectory, relativeModulePath));
      }),
    );
  });

export const generateFunctions = (spec: Spec.AnyWithProps) =>
  Effect.gen(function* () {
    const convexDirectory = yield* findConvexDirectory;

    const groupPathsFromFs = yield* getGroupPathsFromFs;
    const functionPaths = FunctionPaths.make(spec);
    const groupPathsFromSpec = FunctionPaths.groupPaths(functionPaths);

    const overlappingGroupPaths = GroupPaths.GroupPaths.make(
      HashSet.intersection(groupPathsFromFs, groupPathsFromSpec),
    );
    yield* Effect.forEach(overlappingGroupPaths, (groupPath) =>
      Effect.gen(function* () {
        const groupOption = GroupPath.getGroupSpec(spec, groupPath);
        if (Option.isNone(groupOption)) {
          return;
        }
        const group = groupOption.value;
        const functionNames = pipe(
          group.functions,
          Record.values,
          Array.sortBy(
            Order.mapInput(
              Order.String,
              (fn: FunctionSpec.AnyWithProps) => fn.name,
            ),
          ),
          Array.map((fn) => fn.name),
        );
        const result = yield* generateGroupModule({ groupPath, functionNames });
        if (result === "Modified") {
          const relativeModulePath = GroupPath.modulePath(groupPath);
          yield* logFileModified(
            Path.join(convexDirectory, relativeModulePath),
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
  const convexDirectory = yield* findConvexDirectory;

  const RESERVED_CONVEX_TS_FILE_NAMES = new Set([
    "schema.ts",
    "http.ts",
    "crons.ts",
    "auth.config.ts",
    "convex.config.ts",
  ]);

  const allConvexPaths = yield* readDirectoryRecursive(convexDirectory);
  const groupPathArray = yield* pipe(
    allConvexPaths,
    Array.filter(
      (convexPath) =>
        Path.extname(convexPath) === ".ts" &&
        !RESERVED_CONVEX_TS_FILE_NAMES.has(Path.basename(convexPath)) &&
        Path.basename(Path.dirname(convexPath)) !== "_generated",
    ),
    Effect.forEach((groupModulePath) =>
      GroupPath.fromGroupModulePath(groupModulePath),
    ),
  );
  return pipe(groupPathArray, HashSet.fromIterable, GroupPaths.GroupPaths.make);
});

/**
 * Walk a directory tree returning relative file paths (mimicking
 * `fs.readDirectory(_, { recursive: true })` from `@effect/platform`).
 */
const readDirectoryRecursive = (
  root: string,
): Effect.Effect<ReadonlyArray<string>, Fs.FsError> =>
  Effect.gen(function* () {
    const collected: string[] = [];

    const walk = (
      dir: string,
      prefix: string,
    ): Effect.Effect<void, Fs.FsError> =>
      Effect.gen(function* () {
        const entries = yield* Fs.readDirectory(dir);
        yield* Effect.forEach(entries, (entry) =>
          Effect.gen(function* () {
            const fullPath = Path.join(dir, entry);
            const relativePath =
              prefix === "" ? entry : Path.join(prefix, entry);
            const stat = yield* Fs.stat(fullPath);
            if (stat.isDirectory) {
              yield* walk(fullPath, relativePath);
            } else if (stat.isFile) {
              collected.push(relativePath);
            }
          }),
        );
      });

    yield* walk(root, "");
    return collected;
  });

export const removeGroups = (groupPaths: GroupPaths.GroupPaths) =>
  Effect.gen(function* () {
    const convexDirectory = yield* findConvexDirectory;

    yield* Effect.forEach(
      groupPaths,
      (groupPath) =>
        Effect.gen(function* () {
          const relativeModulePath = GroupPath.modulePath(groupPath);
          const modulePath = Path.join(convexDirectory, relativeModulePath);

          yield* Effect.logDebug(`Removing group '${relativeModulePath}'...`);

          yield* Fs.remove(modulePath);
          yield* Effect.logDebug(`Group '${relativeModulePath}' removed`);
        }),
      { concurrency: "unbounded" },
    );
  });

export const writeGroups = (
  spec: Spec.AnyWithProps,
  groupPaths: GroupPaths.GroupPaths,
) =>
  Effect.forEach(groupPaths, (groupPath) =>
    Effect.gen(function* () {
      const groupOption = GroupPath.getGroupSpec(spec, groupPath);
      if (Option.isNone(groupOption)) {
        return;
      }
      const group = groupOption.value;

      const functionNames = pipe(
        group.functions,
        Record.values,
        Array.sortBy(
          Order.mapInput(
            Order.String,
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

const generateOptionalFile = (
  confectFile: string,
  convexFile: string,
  generateContents: (importPath: string) => Effect.Effect<string>,
) =>
  Effect.gen(function* () {
    const confectDirectory = yield* findConfectDirectory;
    const convexDirectory = yield* findConvexDirectory;

    const confectFilePath = Path.join(confectDirectory, confectFile);

    if (!(yield* Fs.exists(confectFilePath))) {
      return Option.none<{ change: WriteChange; convexFilePath: string }>();
    }

    const convexFilePath = Path.join(convexDirectory, convexFile);
    const relativeImportPath = Path.relative(
      Path.dirname(convexFilePath),
      confectFilePath,
    );
    const importPathWithoutExt = removePathExtension(relativeImportPath);
    const contents = yield* generateContents(importPathWithoutExt);
    const change = yield* writeFileString(convexFilePath, contents);
    return Option.some({ change, convexFilePath });
  });

export const generateHttp = generateOptionalFile(
  "http.ts",
  "http.ts",
  (importPath) => templates.http({ httpImportPath: importPath }),
);

export const generateCrons = generateOptionalFile(
  "crons.ts",
  "crons.ts",
  (importPath) => templates.crons({ cronsImportPath: importPath }),
);

export const generateAuthConfig = generateOptionalFile(
  "auth.ts",
  "auth.config.ts",
  (importPath) => templates.authConfig({ authImportPath: importPath }),
);
