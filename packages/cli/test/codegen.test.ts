import { FunctionSpec, GroupSpec } from "@confect/core";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, expect, layer } from "@effect/vitest";
import { Effect, Either, Layer, Schema } from "effect";
import { validateNoParentChildNameCollisions } from "../src/confect/codegen";
import { ConfectDirectory } from "../src/ConfectDirectory";
import type { LeafModule } from "../src/LeafModule";
import {
  discover as discoverTables,
  validate as validateTables,
} from "../src/TableModule";

const fixtureConfect = `${import.meta.dirname}/../../server/test/mock-backend/fixtures/confect`;

const CodegenLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    _tag: "@confect/cli/ConfectDirectory",
    get: Effect.succeed(fixtureConfect),
  }),
);

layer(CodegenLayer)("TableModule.discover", (it) => {
  it.effect("discovers the fixture tables", () =>
    Effect.gen(function* () {
      const tables = yield* discoverTables;
      expect(tables.map((t) => t.tableName).sort()).toEqual([
        "notes",
        "tags",
        "users",
      ]);
      for (const table of tables) {
        expect(table.relativePath.startsWith("tables/")).toBe(true);
      }
    }),
  );

  it.effect(
    "rejects a `confect/tables/*.ts` file that does not default-export an UnnamedTable",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const stowedPath = path.join(fixtureConfect, "tables", "stowed.ts");

        yield* Effect.gen(function* () {
          yield* fs.writeFileString(stowedPath, "export default {};\n");
          const tables = yield* discoverTables;
          const result = yield* Effect.either(validateTables(tables));

          assert(Either.isLeft(result));
          expect(result.left._tag).toBe("InvalidTableDefaultExportError");
        }).pipe(Effect.ensuring(fs.remove(stowedPath).pipe(Effect.orDie)));
      }),
  );

  // Each rejected filename exercises a different validator branch:
  //   - "user-profiles.ts" violates the JS identifier pattern (dash).
  //   - "_internal.ts" starts with `_`, which is reserved for Convex system
  //     tables and excluded by `validateConfectTableIdentifier` even though
  //     `_internal` is a legal JS identifier.
  //   - "import.ts" is a legal-looking identifier but a reserved JS keyword,
  //     so emitting it as a binding in generated files would fail to parse.
  it.effect.each(["user-profiles.ts", "_internal.ts", "import.ts"])(
    "rejects table filename %s",
    (filename) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const invalidPath = path.join(fixtureConfect, "tables", filename);

        yield* Effect.gen(function* () {
          yield* fs.writeFileString(invalidPath, "export default {};\n");
          const result = yield* Effect.either(discoverTables);

          assert(Either.isLeft(result));
          expect(result.left._tag).toBe("InvalidTableFilenameError");
        }).pipe(Effect.ensuring(fs.remove(invalidPath).pipe(Effect.orDie)));
      }),
  );

  it.effect("returns an empty array when there is no tables/ directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped();

      const tables = yield* discoverTables.pipe(
        Effect.provide(
          Layer.mock(ConfectDirectory, {
            _tag: "@confect/cli/ConfectDirectory",
            get: Effect.succeed(tempDir),
          }),
        ),
      );

      expect(tables).toEqual([]);
    }).pipe(Effect.scoped),
  );

  // The "tables/ exists but has no .ts files" branch in `listTableFiles`
  // is structurally distinct from the missing-directory branch above
  // (different early return path) and deserves its own regression test;
  // both branches collapse to an empty result, which the codegen pipeline
  // promotes into a `⚠` warning at the call site (see `warnIfNoTables`).
  it.effect(
    "returns an empty array when tables/ exists but has no .ts files",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fs.makeTempDirectoryScoped();
        const tablesDir = path.join(tempDir, "tables");
        yield* fs.makeDirectory(tablesDir);
        yield* fs.writeFileString(path.join(tablesDir, ".gitkeep"), "");
        yield* fs.writeFileString(
          path.join(tablesDir, "README.md"),
          "tables go here\n",
        );

        const tables = yield* discoverTables.pipe(
          Effect.provide(
            Layer.mock(ConfectDirectory, {
              _tag: "@confect/cli/ConfectDirectory",
              get: Effect.succeed(tempDir),
            }),
          ),
        );

        expect(tables).toEqual([]);
      }).pipe(Effect.scoped),
  );
});

const leaf = (
  relativePath: string,
  pathSegments: [string, ...string[]],
): LeafModule => ({
  relativePath,
  pathSegments,
  groupPathDot: pathSegments.join("."),
  registryGroupPathDot: pathSegments.join("."),
  exportName: pathSegments[pathSegments.length - 1]!,
  runtime: "Convex",
  specImportPath: `../${relativePath.slice(0, -".ts".length)}`,
});

const emptyArgs = Schema.Struct({});
const emptyReturns = Schema.Null;

layer(Layer.empty)("validateNoParentChildNameCollisions", (it) => {
  it.effect("accepts non-colliding parent-with-children layouts", () =>
    Effect.gen(function* () {
      const parent = leaf("notes.spec.ts", ["notes"]);
      const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);
      const parentGroupSpec = GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: emptyArgs,
          returns: emptyReturns,
        }),
      );

      yield* validateNoParentChildNameCollisions(
        [parent, child],
        new Map([[parent.relativePath, parentGroupSpec]]),
      );
    }),
  );

  it.effect(
    "fails when a parent function name matches a sibling subdirectory segment",
    () =>
      Effect.gen(function* () {
        const parent = leaf("notes.spec.ts", ["notes"]);
        const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);
        const parentGroupSpec = GroupSpec.make().addFunction(
          FunctionSpec.publicQuery({
            name: "archived",
            args: emptyArgs,
            returns: emptyReturns,
          }),
        );

        const result = yield* Effect.either(
          validateNoParentChildNameCollisions(
            [parent, child],
            new Map([[parent.relativePath, parentGroupSpec]]),
          ),
        );

        assert(Either.isLeft(result));
        expect(result.left._tag).toBe("ParentChildNameCollisionError");
        expect(result.left.collisionKind).toBe("function");
        expect(result.left.collisionName).toBe("archived");
        expect(result.left.parentSpecPath).toBe("notes.spec.ts");
        expect(result.left.childSpecPath).toBe("notes/archived.spec.ts");
      }),
  );

  it.effect(
    "fails when a parent addGroupAt name matches a sibling subdirectory segment",
    () =>
      Effect.gen(function* () {
        const parent = leaf("notes.spec.ts", ["notes"]);
        const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);
        const inner = GroupSpec.makeAt("inner").addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            args: emptyArgs,
            returns: emptyReturns,
          }),
        );
        const parentGroupSpec = GroupSpec.make().addGroupAt("archived", inner);

        const result = yield* Effect.either(
          validateNoParentChildNameCollisions(
            [parent, child],
            new Map([[parent.relativePath, parentGroupSpec]]),
          ),
        );

        assert(Either.isLeft(result));
        expect(result.left._tag).toBe("ParentChildNameCollisionError");
        expect(result.left.collisionKind).toBe("group");
        expect(result.left.collisionName).toBe("archived");
      }),
  );

  it.effect("ignores collisions when there is no parent leaf", () =>
    Effect.gen(function* () {
      const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);

      yield* validateNoParentChildNameCollisions([child], new Map());
    }),
  );
});
