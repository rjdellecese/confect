import type { FunctionSpec, Spec } from "@confect/core";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
import * as esbuild from "esbuild";
import { BundlerError } from "./BuildError";
import * as FunctionPaths from "./FunctionPaths";
import * as GroupPath from "./GroupPath";
import * as GroupPaths from "./GroupPaths";
import { logFileAdded, logFileModified, logFileRemoved } from "./log";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import * as templates from "./templates";

export const removePathExtension = (pathStr: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return String.slice(0, -path.extname(pathStr).length)(pathStr);
  });

/** Ensures a relative path is a valid ESM/TS module specifier (e.g. `spec` → `./spec`). */
export const toModuleImportPath = (relativePath: string) =>
  Effect.gen(function* () {
    const withoutExt = yield* removePathExtension(relativePath);
    return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
  });

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

export const absoluteExternalsPlugin: esbuild.Plugin = {
  name: "absolute-externals",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.kind !== "import-statement" && args.kind !== "dynamic-import")
        return;
      if (!isExternalImport(args.path)) return;
      // `import.meta.resolve`'s second argument is silently ignored in modern
      // Node, so resolution would always walk up from the CLI's bundled file
      // (`packages/cli/dist/utils.mjs`) instead of from the user's project.
      // Use `createRequire` keyed on the importing file's directory so we
      // resolve out of *their* `node_modules`. The synthetic filename is just
      // a CommonJS resolution anchor; the file does not need to exist.
      const parentFile = pathToFileURL(args.resolveDir + "/_").href;
      const require_ = createRequire(parentFile);
      const resolvedPath = require_.resolve(args.path);
      const resolved = pathToFileURL(resolvedPath).href;
      return { path: resolved, external: true };
    });
  },
};

const bundleEntry = (entryPoint: string, metafile: boolean) =>
  Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        logLevel: "silent",
        metafile,
        plugins: [absoluteExternalsPlugin],
      }),
    catch: (cause) => new BundlerError({ cause }),
  });

const importBundledModule = (result: esbuild.BuildResult) => {
  const code = result.outputFiles![0]!.text;
  const dataUrl =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  return import(dataUrl);
};

export const bundleAndImportWithInputs = (entryPoint: string) =>
  Effect.gen(function* () {
    const result = yield* bundleEntry(entryPoint, true);
    const module = yield* Effect.tryPromise({
      try: () => importBundledModule(result),
      catch: (cause) => new BundlerError({ cause }),
    });
    if (!result.metafile) {
      return yield* Effect.dieMessage("esbuild metafile missing");
    }
    return { module, metafile: result.metafile } as const;
  });

/**
 * Bundle a TypeScript entry point with esbuild and import the result via a
 * data URL. This handles extensionless `.ts` imports regardless of whether the
 * user's project sets `"type": "module"` in package.json.
 */
export const bundleAndImport = (entryPoint: string) =>
  Effect.gen(function* () {
    const { module } = yield* bundleAndImportWithInputs(entryPoint);
    return module;
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

export const removePathIfExists = (
  filePath: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (!(yield* fs.exists(filePath))) {
      return;
    }

    yield* fs.remove(filePath).pipe(
      Effect.catchTag("SystemError", (error) =>
        error.reason === "NotFound" ? Effect.void : Effect.fail(error),
      ),
    );
  });

/**
 * Bump the mtime of `convex/schema.ts` so the Convex CLI's chokidar watcher
 * emits a `change` event after every successful Confect codegen run. Without
 * this, a codegen that doesn't change any file content (for example,
 * recovering from a transient broken state in `confect/`) leaves Convex
 * stuck on its previous error because nothing it observes has changed.
 */
export const touchConvexSchema = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;
  const schemaPath = path.join(convexDirectory, "schema.ts");

  if (!(yield* fs.exists(schemaPath))) {
    return;
  }

  const now = new Date();
  yield* fs.utimes(schemaPath, now, now);
});

export const generateGroupModule = ({
  groupPath,
  functionNames,
  registeredFunctionsImportPath,
  useNode = false,
}: {
  groupPath: GroupPath.GroupPath;
  functionNames: string[];
  registeredFunctionsImportPath: string;
  useNode?: boolean;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const convexDirectory = yield* ConvexDirectory.get;

    const relativeModulePath = yield* GroupPath.modulePath(groupPath);
    const modulePath = path.join(convexDirectory, relativeModulePath);

    const directoryPath = path.dirname(modulePath);
    if (!(yield* fs.exists(directoryPath))) {
      yield* fs.makeDirectory(directoryPath, { recursive: true });
    }

    const functionsContentsString = yield* templates.functions({
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
    const confectDirectory = yield* ConfectDirectory.get;

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
        const relativeModulePath = yield* GroupPath.modulePath(groupPath);
        const modulePath = path.join(convexDirectory, relativeModulePath);
        const registrySegments =
          groupPath.pathSegments[0] === "node"
            ? groupPath.pathSegments.slice(1)
            : groupPath.pathSegments;
        const registeredFunctionsPath =
          path.join(
            confectDirectory,
            "_generated",
            "registeredFunctions",
            ...registrySegments,
          ) + ".ts";
        const registeredFunctionsImportPath = yield* toModuleImportPath(
          path.relative(path.dirname(modulePath), registeredFunctionsPath),
        );
        const result = yield* generateGroupModule({
          groupPath,
          functionNames,
          registeredFunctionsImportPath,
          useNode: groupPath.pathSegments[0] === "node",
        });
        if (result === "Modified") {
          yield* logFileModified(modulePath);
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
  spec: Spec.AnyWithProps,
  groupPaths: GroupPaths.GroupPaths,
) =>
  Effect.forEach(groupPaths, (groupPath) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const convexDirectory = yield* ConvexDirectory.get;
      const confectDirectory = yield* ConfectDirectory.get;
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

      const relativeModulePath = yield* GroupPath.modulePath(groupPath);
      const modulePath = path.join(convexDirectory, relativeModulePath);
      const registeredFunctionsPath =
        path.join(
          confectDirectory,
          "_generated",
          "registeredFunctions",
          ...groupPath.pathSegments,
        ) + ".ts";
      const registeredFunctionsImportPath = yield* toModuleImportPath(
        path.relative(path.dirname(modulePath), registeredFunctionsPath),
      );

      yield* Effect.logDebug(`Generating group ${groupPath}...`);
      yield* generateGroupModule({
        groupPath,
        functionNames,
        registeredFunctionsImportPath,
        useNode: groupPath.pathSegments[0] === "node",
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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;
    const convexDirectory = yield* ConvexDirectory.get;

    const confectFilePath = path.join(confectDirectory, confectFile);

    if (!(yield* fs.exists(confectFilePath))) {
      return Option.none();
    }

    const convexFilePath = path.join(convexDirectory, convexFile);
    const relativeImportPath = path.relative(
      path.dirname(convexFilePath),
      confectFilePath,
    );
    const importPathWithoutExt = yield* removePathExtension(relativeImportPath);
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
