import { Identifier } from "@confect/core";
import * as Table from "@confect/server/Table";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Order from "effect/Order";
import { fromBundlerError } from "./BuildError";
import * as Bundler from "./Bundler";
import {
  DuplicateTableNameError,
  InvalidTableDefaultExportError,
  InvalidTableFilenameError,
} from "./CodegenError";
import { ConfectDirectory } from "./ConfectDirectory";

export const TABLES_DIRNAME = "tables";

/**
 * Discovered metadata for a single user-authored table module under
 * `confect/tables/`.
 *
 * - `relativePath` — path from `confect/` to the file (e.g. `tables/notes.ts`).
 * - `tableName` — the file basename (e.g. `notes`). This is also the import
 *   binding used in generated files, and the table name surfaced to Convex.
 */
export interface TableModule {
  readonly relativePath: string;
  readonly tableName: string;
}

const tableNameFromRelativePath = (relativePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { name } = path.parse(relativePath);
    return name;
  });

const listTableFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const confectDirectory = yield* ConfectDirectory.get;
  const tablesDirectory = path.join(confectDirectory, TABLES_DIRNAME);

  if (!(yield* fs.exists(tablesDirectory))) {
    return [] as ReadonlyArray<string>;
  }

  const allPaths = yield* fs.readDirectory(tablesDirectory, {
    recursive: true,
  });

  return pipe(
    allPaths,
    Array.filter((p) => p.endsWith(".ts") && !p.endsWith(".test.ts")),
    Array.map((p) => path.join(TABLES_DIRNAME, p)),
  );
});

const byTableName = Order.mapInput(
  Order.String,
  (tableModule: TableModule) => tableModule.tableName,
);

/**
 * Discover every `confect/tables/**\/*.ts` module by listing the directory.
 * Validates that each filename is a legal table identifier — the table name is
 * derived from the file basename, so the filename must be a valid JavaScript
 * identifier with no leading underscore (Convex reserves `_<name>` for system
 * tables).
 *
 * This step does *not* bundle the table modules. It runs early in the codegen
 * pipeline so the `_generated/id.ts` constructor can be emitted *before* any
 * user-authored table is bundled (those modules import from `_generated/id.ts`
 * for cross-table refs).
 *
 * A missing `confect/tables/` directory is allowed and produces an empty list.
 *
 * Fails with {@link InvalidTableFilenameError} if any filename is not a valid
 * table identifier, or {@link DuplicateTableNameError} if two files resolve to
 * the same table name (the directory is scanned recursively but names are
 * derived from the basename alone, so `tables/a/notes.ts` and
 * `tables/b/notes.ts` would collide).
 */
export const discover = Effect.gen(function* () {
  const relativePaths = yield* listTableFiles;

  const tableModules = yield* Effect.forEach(
    relativePaths,
    (relativePath) =>
      Effect.gen(function* () {
        const tableName = yield* tableNameFromRelativePath(relativePath);
        yield* Effect.try({
          try: () => Identifier.validateConfectTableIdentifier(tableName),
          catch: (e) =>
            new InvalidTableFilenameError({
              tablePath: relativePath,
              reason: e instanceof Error ? e.message : String(e),
            }),
        });
        return { relativePath, tableName } satisfies TableModule;
      }),
    { concurrency: "unbounded" },
  );

  const sorted = pipe(tableModules, Array.sortBy(byTableName));

  const collisions = Object.entries(
    Array.groupBy(sorted, (tableModule) => tableModule.tableName),
  )
    .filter(([, group]) => group.length > 1)
    .map(([tableName, group]) => ({
      tableName,
      tablePaths: Array.map(group, (tableModule) => tableModule.relativePath),
    }));

  if (collisions.length > 0) {
    return yield* new DuplicateTableNameError({ collisions });
  }

  return sorted;
});

/**
 * Bundle every discovered table module and verify that its default export is
 * an {@link Table.UnnamedTable} (the result of `Table.make(...)` before a
 * name has been bound). Fails with {@link InvalidTableDefaultExportError} if
 * any module's default export is missing or has the wrong shape.
 *
 * Must run *after* `_generated/id.ts` has been emitted, because user-authored
 * table modules typically `import { Id } from "../_generated/id"` for
 * cross-table references.
 */
export const validate = (tableModules: ReadonlyArray<TableModule>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* Effect.forEach(
      tableModules,
      ({ relativePath }) =>
        Effect.gen(function* () {
          const absolutePath = path.resolve(confectDirectory, relativePath);
          const { module } = yield* Bundler.bundle(absolutePath).pipe(
            Effect.mapError((error) => fromBundlerError(relativePath, error)),
          );

          if (!Table.isUnnamedTable(module.default)) {
            return yield* new InvalidTableDefaultExportError({
              tablePath: relativePath,
            });
          }
        }),
      { concurrency: "unbounded" },
    );
  });
