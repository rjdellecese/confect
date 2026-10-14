import { Table } from "@confect/core";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as esbuild from "esbuild";
import * as Bundler from "@confect/cli/Bundler";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import { codegenHandler } from "@confect/cli/confect/codegen";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import {
  discover as discoverTables,
  validate as validateTables,
} from "@confect/cli/TableModule";
import * as Project from "./integration/Project";

vi.mock("esbuild", (importOriginal) =>
  importOriginal<typeof esbuild>().then((original) => ({
    ...original,
    build: vi.fn(original.build),
  })),
);

layer(Layer.mergeAll(NodePath.layer, NodeFileSystem.layer))(
  "codegenHandler",
  (it) => {
    it.effect(
      "shares one build per evaluation phase without changing generated output",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write("confect/tables/labels.ts", Project.table);
          for (const name of ["other", "another"]) {
            yield* project.write(`confect/${name}.spec.ts`, Project.spec);
            yield* project.write(
              `confect/${name}.impl.ts`,
              Project.impl.replace('"./notes.spec"', `"./${name}.spec"`),
            );
          }
          const run = codegenHandler.pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
          );
          const outputs = Effect.gen(function* () {
            const files = yield* Effect.forEach(
              ["confect/_generated", "convex"],
              (directory) =>
                fs
                  .readDirectory(path.join(project.root, directory), {
                    recursive: true,
                  })
                  .pipe(
                    Effect.map((entries) =>
                      entries
                        .filter((entry) => entry.endsWith(".ts"))
                        .map((entry) => path.join(directory, entry)),
                    ),
                  ),
            );
            return Object.fromEntries(
              yield* Effect.forEach(files.flat(), (file) =>
                fs
                  .readFileString(path.join(project.root, file))
                  .pipe(Effect.map((contents) => [file, contents] as const)),
              ),
            );
          });
          vi.mocked(esbuild.build).mockClear();
          expect((yield* run).anyWritesHappened).toBe(true);
          const batchedOutputs = yield* outputs;
          expect(
            vi
              .mocked(esbuild.build)
              .mock.calls.map(
                ([options]) => Object.keys(options?.entryPoints ?? {}).length,
              )
              .filter((count) => count > 1),
          ).toEqual([2, 3, 3]);
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi
                .spyOn(Bundler, "withBatch")
                .mockImplementation(
                  <A, E, R>(
                    _entries: ReadonlyArray<string>,
                    effect: Effect.Effect<A, E, R>,
                  ) => effect,
                ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          expect((yield* run).anyWritesHappened).toBe(false);
          expect(yield* outputs).toEqual(batchedOutputs);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "bounds spec and impl phases without overlapping them",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          for (const index of Array.range(0, 7)) {
            yield* project.write(
              `confect/group${index}.spec.ts`,
              'import { GroupSpec } from "@confect/core"; export default GroupSpec.make();',
            );
            yield* project.write(
              `confect/group${index}.impl.ts`,
              `import { GroupImpl } from "@confect/server";
import databaseSchema from "./_generated/schema";
import spec from "./group${index}.spec";
export default GroupImpl.make(databaseSchema, spec).pipe(GroupImpl.finalize);`,
            );
          }
          const active = { spec: 0, impl: 0 };
          const maximum = { spec: 0, impl: 0 };
          let completedSpecs = 0;
          const original = Bundler.bundle;
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Bundler, "bundle").mockImplementation((entry) =>
                Effect.gen(function* () {
                  const phase = entry.endsWith(".spec.ts")
                    ? "spec"
                    : entry.endsWith(".impl.ts")
                      ? "impl"
                      : undefined;
                  if (phase === undefined) return yield* original(entry);
                  if (phase === "impl") expect(completedSpecs).toBe(9);
                  active[phase]++;
                  maximum[phase] = Math.max(maximum[phase], active[phase]);
                  yield* Effect.yieldNow;
                  return yield* original(entry).pipe(
                    Effect.ensuring(
                      Effect.sync(() => {
                        active[phase]--;
                        if (phase === "spec") completedSpecs++;
                      }),
                    ),
                  );
                }),
              ),
            ),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          yield* codegenHandler.pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
          );
          expect(maximum).toEqual({ spec: 4, impl: 4 });
          expect(completedSpecs).toBe(9);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "does not bundle the same spec twice during one codegen pass",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const bundle = yield* Effect.acquireRelease(
            Effect.sync(() => vi.spyOn(Bundler, "bundle")),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          yield* codegenHandler.pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(path.join(project.root, "confect")),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
          );
          const specBuilds = bundle.mock.calls.filter(
            ([entry]) =>
              entry === path.join(project.root, "confect/notes.spec.ts"),
          );
          expect(specBuilds).toHaveLength(1);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "bootstraps dependent modules once without relying on stale output",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const confect = path.join(project.root, "confect");
          const run = codegenHandler.pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(project.root),
            }),
            Effect.provideService(ConfectDirectory, {
              get: Effect.succeed(confect),
            }),
            Effect.provideService(ConvexDirectory, {
              get: Effect.succeed(path.join(project.root, "convex")),
            }),
          );
          expect((yield* run).anyWritesHappened).toBe(true);
          expect((yield* run).anyWritesHappened).toBe(false);
          yield* fs.remove(path.join(confect, "_generated"), {
            recursive: true,
          });
          expect((yield* run).anyWritesHappened).toBe(true);
          expect((yield* run).anyWritesHappened).toBe(false);
        }).pipe(Effect.scoped),
    );
  },
);

const fixtureConfect = `${import.meta.dirname}/../../server/test/mock-backend/fixtures/confect`;

const CodegenLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.succeed(
    ConfectDirectory,
    ConfectDirectory.of({ get: Effect.succeed(fixtureConfect) }),
  ),
);

layer(CodegenLayer)("TableModule.validate", (it) => {
  it.effect("bounds table bundling to four concurrent builds", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let active = 0;
      let maximum = 0;
      const bundle = yield* Effect.acquireRelease(
        Effect.sync(() =>
          vi.spyOn(Bundler, "bundle").mockImplementation(() =>
            Effect.gen(function* () {
              active++;
              maximum = Math.max(maximum, active);
              if (active === 4) yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
              active--;
              return {
                module: { default: Table.make(() => Schema.Struct({})) },
                metafile: { inputs: {}, outputs: {} },
              };
            }),
          ),
        ),
        (spy) => Effect.sync(() => spy.mockRestore()),
      );
      const fiber = yield* validateTables(
        Array.range(0, 8).map((index) => ({
          relativePath: `tables/t${index}.ts`,
          tableName: `t${index}`,
        })),
      ).pipe(Effect.forkScoped);
      yield* Deferred.await(started);
      yield* Effect.yieldNow;
      expect(active).toBe(4);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(fiber);
      expect(maximum).toBe(4);
      expect(bundle).toHaveBeenCalledTimes(9);
    }).pipe(Effect.scoped),
  );
});

layer(CodegenLayer)("TableModule.discover", (it) => {
  it.effect("discovers the fixture tables", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const tables = yield* discoverTables;
      expect(tables.map((t) => t.tableName).sort()).toEqual([
        "events",
        "notes",
        "tags",
        "users",
      ]);
      for (const table of tables) {
        expect(String.startsWith(`tables${path.sep}`)(table.relativePath)).toBe(
          true,
        );
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
          const result = yield* Effect.result(validateTables(tables));

          assert(Result.isFailure(result));
          expect(result.failure._tag).toBe("InvalidTableDefaultExportError");
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
          const result = yield* Effect.result(discoverTables);

          assert(Result.isFailure(result));
          expect(result.failure._tag).toBe("InvalidTableFilenameError");
        }).pipe(Effect.ensuring(fs.remove(invalidPath).pipe(Effect.orDie)));
      }),
  );

  // Names are derived from the basename alone, but the directory is scanned
  // recursively—so two files in different subdirectories can resolve to the
  // same table name. That must fail loudly rather than racing on a shared
  // generated wrapper path/emitting duplicate schema bindings. Two distinct
  // colliding names are seeded so we can assert that *all* collisions are
  // captured in a single pass, not just the first.
  it.effect("rejects every set of files that resolve to the same name", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fs.makeTempDirectoryScoped();
      const tablesDir = path.join(tempDir, "tables");
      yield* fs.makeDirectory(path.join(tablesDir, "a"), { recursive: true });
      yield* fs.makeDirectory(path.join(tablesDir, "b"), { recursive: true });
      yield* fs.writeFileString(
        path.join(tablesDir, "a", "notes.ts"),
        "export default {};\n",
      );
      yield* fs.writeFileString(
        path.join(tablesDir, "b", "notes.ts"),
        "export default {};\n",
      );
      yield* fs.writeFileString(
        path.join(tablesDir, "a", "users.ts"),
        "export default {};\n",
      );
      yield* fs.writeFileString(
        path.join(tablesDir, "b", "users.ts"),
        "export default {};\n",
      );

      const result = yield* Effect.result(
        discoverTables.pipe(
          Effect.provide(
            Layer.succeed(
              ConfectDirectory,
              ConfectDirectory.of({ get: Effect.succeed(tempDir) }),
            ),
          ),
        ),
      );

      assert(Result.isFailure(result));
      assert(result.failure._tag === "DuplicateTableNameError");
      const byName = Object.fromEntries(
        result.failure.collisions.map((c) => [
          c.tableName,
          [...c.tablePaths].sort(),
        ]),
      );
      expect(byName).toEqual({
        notes: [
          path.join("tables", "a", "notes.ts"),
          path.join("tables", "b", "notes.ts"),
        ],
        users: [
          path.join("tables", "a", "users.ts"),
          path.join("tables", "b", "users.ts"),
        ],
      });
    }).pipe(Effect.scoped),
  );

  it.effect("returns an empty array when there is no tables/ directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped();

      const tables = yield* discoverTables.pipe(
        Effect.provide(
          Layer.succeed(
            ConfectDirectory,
            ConfectDirectory.of({ get: Effect.succeed(tempDir) }),
          ),
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
            Layer.succeed(
              ConfectDirectory,
              ConfectDirectory.of({ get: Effect.succeed(tempDir) }),
            ),
          ),
        );

        expect(tables).toEqual([]);
      }).pipe(Effect.scoped),
  );
});
