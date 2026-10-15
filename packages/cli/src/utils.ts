import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as String from "effect/String";
import { logFileAdded, logFileModified } from "./log";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import * as templates from "./templates";

export const removePathExtension = Effect.fnUntraced(function* (
  pathStr: string,
) {
  const path = yield* Path.Path;

  return String.slice(0, -path.extname(pathStr).length)(pathStr);
});

export const toPosixPath = (path: Path.Path, pathStr: string): string =>
  pipe(String.split(pathStr, path.sep), Array.join("/"));

/**
 * Ensures a relative path is a valid ESM/TS module specifier (e.g. `spec` →
 * `./spec`).
 */
export const toModuleImportPath = Effect.fnUntraced(function* (
  relativePath: string,
) {
  const path = yield* Path.Path;
  const withoutExt = toPosixPath(
    path,
    yield* removePathExtension(relativePath),
  );
  return String.startsWith(".")(withoutExt) ? withoutExt : `./${withoutExt}`;
});

export const writeFileStringAndLog = Effect.fnUntraced(function* (
  filePath: string,
  contents: string,
) {
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

export const writeFileString = Effect.fnUntraced(function* (
  filePath: string,
  contents: string,
): Effect.fn.Return<WriteChange, PlatformError, FileSystem.FileSystem> {
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

export const removePathIfExists = Effect.fnUntraced(function* (
  filePath: string,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;

  if (!(yield* fs.exists(filePath))) {
    return;
  }

  yield* fs
    .remove(filePath)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound" ? Effect.void : Effect.fail(error),
      ),
    );
});

/**
 * Bump the mtime of `convex/schema.ts` so the Convex CLI's chokidar watcher
 * emits a `change` event after explicit codegen, bootstrap, or recovery.
 * Recovery can leave generated contents unchanged, so it needs an explicit
 * notification to release Convex from a previous error. Ordinary successful
 * watch updates rely on their source/output changes instead of invalidating a
 * Convex push that may already be processing those changes.
 */
export const touchConvexSchema = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const convexDirectory = yield* ConvexDirectory.get;
  const schemaPath = path.join(convexDirectory, "schema.ts");

  if (!(yield* fs.exists(schemaPath))) {
    return;
  }

  const now = yield* DateTime.nowAsDate;
  yield* fs.utimes(schemaPath, now, now);
});

const generateOptionalFile = Effect.fnUntraced(function* (
  confectFile: string,
  convexFile: string,
  generateContents: (importPath: string) => Effect.Effect<string>,
) {
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
  const contents = yield* generateContents(
    yield* toModuleImportPath(relativeImportPath),
  );
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
