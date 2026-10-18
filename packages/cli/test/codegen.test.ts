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
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import {
  codegenHandler,
  generateWithSnapshot,
  updateDeclarations,
} from "@confect/cli/confect/codegen";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import { TableModulePath } from "@confect/cli/TableModulePath";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
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
    context: vi.fn(original.context),
  })),
);

layer(Layer.mergeAll(NodePath.layer, NodeFileSystem.layer))(
  "codegenHandler",
  (it) => {
    it.effect.each([
      { files: ["bad-name.ts"], error: "InvalidTableFilenameError" },
      {
        files: ["user_profiles.ts", "userProfiles.ts"],
        error: "ConflictingDocNameError",
      },
    ])("rejects $error before writing generated bindings", ({ files, error }) =>
      Effect.gen(function* () {
        const project = yield* Project.make;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        for (const file of files)
          yield* project.write(`confect/tables/${file}`, Project.table);
        const result = yield* project
          .provide(codegenHandler)
          .pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure._tag).toBe(error);
        expect(
          yield* fs.exists(path.join(project.root, "confect", "_generated")),
        ).toBe(false);
        expect(
          yield* fs.readDirectory(path.join(project.root, "convex")),
        ).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.effect.each([
      {
        table: "export default {};",
        spec: Project.spec,
        error: "InvalidTableDefaultExportError",
      },
      {
        table: Project.table,
        spec: "export default {};",
        error: "SpecMissingDefaultGroupSpecError",
      },
      { table: Project.table, spec: Project.spec, error: "BundleFailedError" },
    ])(
      "preserves $error when the shared build cannot compile an implementation",
      ({ table, spec, error }) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write("confect/tables/notes.ts", table);
          yield* project.write("confect/notes.spec.ts", spec);
          yield* project.write("confect/notes.impl.ts", "export default ;");
          const result = yield* project
            .provide(codegenHandler)
            .pipe(Effect.result);
          assert(Result.isFailure(result));
          expect(result.failure._tag).toBe(error);
          yield* project.write("confect/tables/notes.ts", Project.table);
          yield* project.write("confect/notes.spec.ts", Project.spec);
          yield* project.write("confect/notes.impl.ts", Project.impl);
          yield* project.provide(codegenHandler);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each(["http.ts", "crons.ts", "auth.ts"])(
      "checks optional module %s without evaluating it and recovers after errors",
      (file) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write(`confect/${file}`, "export default ;");
          const failed = yield* project
            .provide(codegenHandler)
            .pipe(Effect.result);
          assert(Result.isFailure(failed));
          expect(failed.failure).toMatchObject({
            _tag: "BundleFailedError",
            file,
          });
          yield* project.write(
            `confect/${file}`,
            'import "./_generated/registeredFunctions/notes";\nimport "../convex/notes";\nthrow new Error("Optional runtime must not execute");\nexport default {};\n',
          );
          yield* project.provide(codegenHandler);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
    it.effect.each([
      "schema.spec.ts",
      "http.spec.ts",
      "crons.spec.ts",
      "bad-dir/notes.spec.ts",
      "notes/bad-name.spec.ts",
      "notes/..spec.ts",
      "notes/...spec.ts",
    ])(
      "rejects invalid group path %s before replacing the Convex schema",
      (file) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* fs.makeDirectory(
            path.dirname(path.join(project.root, "confect", file)),
            { recursive: true },
          );
          const prefix = "../".repeat(file.split("/").length - 1) || "./";
          const name = path.basename(file, ".spec.ts");
          yield* project.write(
            `confect/${file}`,
            Project.spec.replaceAll('"./_generated/', `"${prefix}_generated/`),
          );
          yield* project.write(
            `confect/${file.replace(/\.spec\.ts$/, ".impl.ts")}`,
            Project.impl
              .replaceAll('"./_generated/', `"${prefix}_generated/`)
              .replace('"./notes.spec"', `"./${name}.spec"`),
          );
          const previousSchema = "export default {};\n";
          yield* project.write("convex/schema.ts", previousSchema);
          const result = yield* project
            .provide(codegenHandler)
            .pipe(Effect.result);
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "NoncanonicalPath",
            relativePath: file,
          });
          expect(
            yield* fs.readFileString(
              path.join(project.root, "convex/schema.ts"),
            ),
          ).toBe(previousSchema);
          expect(
            yield* fs.exists(path.join(project.root, "confect", "_generated")),
          ).toBe(false);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "notifies Convex after explicit codegen even when generated contents are unchanged",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.provide(codegenHandler);
          const before = yield* project.generatedFiles;
          const schema = path.join(project.root, "convex/schema.ts");
          const timestamp = DateTime.toDateUtc(DateTime.makeUnsafe(1000));
          yield* fs.utimes(schema, timestamp, timestamp);
          yield* TestClock.setTime(2000);
          expect(
            yield* Project.writtenFiles(project.provide(codegenHandler)),
          ).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(before);
          expect(
            Option.getOrThrow((yield* fs.stat(schema)).mtime).getTime(),
          ).toBe(2000);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "updates a spec without evaluating unrelated modules and matches full generation",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write("confect/other.spec.ts", Project.spec);
          yield* project.write(
            "confect/other.impl.ts",
            Project.impl.replace('"./notes.spec"', '"./other.spec"'),
          );
          const { snapshot } = yield* project.provide(generateWithSnapshot);
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec.replace('name: "list"', 'name: "latest"'),
          );
          yield* project.write(
            "confect/notes.impl.ts",
            Project.impl.replace('"list"', '"latest"'),
          );
          const bundle = yield* Effect.acquireRelease(
            Effect.sync(() => vi.spyOn(Bundler, "compile")),
            (spy) => Effect.sync(() => spy.mockRestore()),
          );
          const next = yield* project.provide(
            updateDeclarations(
              snapshot,
              [
                {
                  _tag: "Spec",
                  relativePath: SpecModulePath.make("notes.spec.ts"),
                },
              ],
              [],
            ),
          );
          expect(
            bundle.mock.calls.map(([entry]) =>
              path.relative(project.root, entry),
            ),
          ).toEqual([
            path.join("confect", "notes.spec.ts"),
            path.join("confect", "notes.impl.ts"),
          ]);
          expect(
            [...GenerationSnapshot.functionPaths(next)]
              .map((fn) => fn.name)
              .sort(),
          ).toEqual(["latest", "list"]);
          expect(
            [...GenerationSnapshot.functionPaths(snapshot)].map(
              (fn) => fn.name,
            ),
          ).toEqual(["list", "list"]);
          const incremental = yield* project.generatedFiles;
          expect(
            yield* Project.writtenFiles(project.provide(codegenHandler)),
          ).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(incremental);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "rewrites only the registry when function provenance changes",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          let { snapshot } = yield* project.provide(generateWithSnapshot);
          const registry = path.join(
            "confect",
            "_generated",
            "registeredFunctions",
            "notes.ts",
          );
          const nativeSpec = `import { FunctionSpec, GroupSpec } from "@confect/core";
import type { RegisteredQuery } from "convex/server";
export default GroupSpec.make().addFunction(FunctionSpec.convexPublicQuery<RegisteredQuery<"public", {}, null>>()("list"));`;
          const nativeImpl = `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Layer from "effect/Layer";
import { queryGeneric } from "convex/server";
import databaseSchema from "./_generated/schema";
import notes from "./notes.spec";
const list = FunctionImpl.make(databaseSchema, notes, "list", queryGeneric(() => null));
export default GroupImpl.make(databaseSchema, notes).pipe(Layer.provide(list), GroupImpl.finalize);`;
          for (const { spec, impl, registration } of [
            {
              spec: nativeSpec,
              impl: nativeImpl,
              registration: "RegisteredFunctions.buildForGroup<",
            },
            {
              spec: Project.spec,
              impl: Project.impl,
              registration: 'handler: forward(definitions["list"].handler)',
            },
          ]) {
            yield* project.write("confect/notes.spec.ts", spec);
            yield* project.write("confect/notes.impl.ts", impl);
            const before = snapshot;
            const writes = yield* Project.writtenFiles(
              project.provide(
                updateDeclarations(
                  snapshot,
                  [
                    {
                      _tag: "Spec",
                      relativePath: SpecModulePath.make("notes.spec.ts"),
                    },
                  ],
                  [],
                ).pipe(
                  Effect.tap((next) =>
                    Effect.sync(() => {
                      snapshot = next;
                    }),
                  ),
                ),
              ),
            );
            expect(writes).toEqual([path.join(project.root, registry)]);
            expect(GenerationSnapshot.diff(before, snapshot)).toEqual({
              removed: [],
              changed: [],
            });
            const incremental = yield* project.generatedFiles;
            expect(incremental[registry]).toContain(registration);
            expect(
              yield* Project.writtenFiles(project.provide(codegenHandler)),
            ).toEqual([]);
            expect(yield* project.generatedFiles).toEqual(incremental);
          }
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "checks global parent collisions before validating an updated implementation",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* fs.makeDirectory(path.join(project.root, "confect", "notes"));
          yield* project.write(
            "confect/notes/archived.spec.ts",
            Project.spec.replace('"./_generated/', '"../_generated/'),
          );
          yield* project.write(
            "confect/notes/archived.impl.ts",
            Project.impl
              .replaceAll('"./_generated/', '"../_generated/')
              .replace('"./notes.spec"', '"./archived.spec"'),
          );
          const { snapshot } = yield* project.provide(generateWithSnapshot);
          const before = yield* project.generatedFiles;
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec.replace('name: "list"', 'name: "archived"'),
          );
          const result = yield* project
            .provide(
              updateDeclarations(
                snapshot,
                [
                  {
                    _tag: "Spec",
                    relativePath: SpecModulePath.make("notes.spec.ts"),
                  },
                ],
                [],
              ),
            )
            .pipe(Effect.result);
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "ParentChildNameCollisionError",
            parentSpecPath: "notes.spec.ts",
            childSpecPath: "notes/archived.spec.ts",
            collisionName: "archived",
          });
          expect(yield* project.generatedFiles).toEqual(before);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "updates runtime and removes the last function with fresh-generation parity",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const project = yield* Project.make;
          let { snapshot } = yield* project.provide(generateWithSnapshot);
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec
              .replace("GroupSpec.make()", "GroupSpec.makeNode()")
              .replace(
                "FunctionSpec.publicQuery",
                "FunctionSpec.publicNodeAction",
              ),
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import schema from "./_generated/schema";
import spec from "./notes.spec";
export default GroupImpl.make(schema, spec).pipe(Layer.provide(FunctionImpl.make(schema, spec, "list", () => Effect.succeed([]))), GroupImpl.finalize);
`,
          );
          snapshot = yield* project.provide(
            updateDeclarations(
              snapshot,
              [
                {
                  _tag: "Spec",
                  relativePath: SpecModulePath.make("notes.spec.ts"),
                },
              ],
              [],
            ),
          );
          const nodeOutputs = yield* project.generatedFiles;
          expect(nodeOutputs[path.join("convex", "notes.ts")]).toContain(
            '"use node"',
          );
          expect(
            yield* Project.writtenFiles(project.provide(codegenHandler)),
          ).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(nodeOutputs);
          yield* project.write(
            "confect/notes.spec.ts",
            'import { GroupSpec } from "@confect/core"; export default GroupSpec.makeNode();\n',
          );
          yield* project.write("confect/notes.impl.ts", Project.emptyImpl);
          const empty = yield* project.provide(
            updateDeclarations(
              snapshot,
              [
                {
                  _tag: "Spec",
                  relativePath: SpecModulePath.make("notes.spec.ts"),
                },
              ],
              [],
            ),
          );
          expect([...GenerationSnapshot.functionPaths(empty)]).toEqual([]);
          const removedOutputs = yield* project.generatedFiles;
          expect(
            Object.hasOwn(removedOutputs, path.join("convex", "notes.ts")),
          ).toBe(false);
          expect(
            yield* Project.writtenFiles(project.provide(codegenHandler)),
          ).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(removedOutputs);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "validates changed tables before affected implementations without rewriting declarations",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const { snapshot } = yield* project.provide(generateWithSnapshot);
          yield* project.write(
            "confect/tables/notes.ts",
            "export default {};\n",
          );
          const failed = yield* project
            .provide(
              updateDeclarations(
                snapshot,
                [
                  {
                    _tag: "Table",
                    relativePath: TableModulePath.make("tables/notes.ts"),
                  },
                ],
                [ImplModulePath.make("notes.impl.ts")],
              ),
            )
            .pipe(Effect.result);
          assert(Result.isFailure(failed));
          expect(failed.failure._tag).toBe("InvalidTableDefaultExportError");
          yield* project.write(
            "confect/tables/notes.ts",
            Project.table.replace(
              "text: Schema.String",
              "text: Schema.String, archived: Schema.Boolean",
            ),
          );
          const before = yield* project.generatedFiles;
          yield* project.provide(
            updateDeclarations(
              snapshot,
              [
                {
                  _tag: "Table",
                  relativePath: TableModulePath.make("tables/notes.ts"),
                },
              ],
              [ImplModulePath.make("notes.impl.ts")],
            ),
          );
          expect(yield* project.generatedFiles).toEqual(before);
          expect(
            yield* Project.writtenFiles(project.provide(codegenHandler)),
          ).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(before);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "separates table roots while sharing specs and implementations without changing generated output",
      () =>
        Effect.gen(function* () {
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
          vi.mocked(esbuild.build).mockClear();
          vi.mocked(esbuild.context).mockClear();
          expect(yield* Project.writtenFiles(run)).not.toEqual([]);
          const batchedOutputs = yield* project.generatedFiles;
          expect(vi.mocked(esbuild.build)).not.toHaveBeenCalled();
          expect(vi.mocked(esbuild.context)).toHaveBeenCalledTimes(2);
          expect(
            vi
              .mocked(esbuild.context)
              .mock.calls.map(
                ([options]) => Object.keys(options?.entryPoints ?? {}).length,
              )
              .filter((count) => count > 1),
          ).toEqual([2, 6]);
          expect(
            vi
              .mocked(esbuild.context)
              .mock.calls.map(([options]) => options?.entryPoints),
          ).toEqual([
            expect.arrayContaining(
              ["labels", "notes"].map((name) =>
                expect.objectContaining({
                  in: path.join(
                    project.root,
                    "confect",
                    "tables",
                    `${name}.ts`,
                  ),
                }),
              ),
            ),
            expect.arrayContaining(
              ["notes", "other", "another"].flatMap((name) =>
                ["spec", "impl"].map((kind) =>
                  expect.objectContaining({
                    in: path.join(
                      project.root,
                      "confect",
                      `${name}.${kind}.ts`,
                    ),
                  }),
                ),
              ),
            ),
          ]);
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
          expect(yield* Project.writtenFiles(run)).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(batchedOutputs);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "evaluates each spec once across table, spec and implementation phases",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec +
              '\nglobalThis.__confectSpecRuns = (globalThis.__confectSpecRuns ?? 0) + 1;\nif (globalThis.__confectSpecRuns !== 1) throw new Error("Spec evaluated twice in one generation");\n',
          );
          yield* project.provide(codegenHandler);
          const before = yield* project.generatedFiles;
          expect(
            yield* Project.writtenFiles(project.provide(codegenHandler)),
          ).toEqual([]);
          expect(yield* project.generatedFiles).toEqual(before);
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
          const original = Bundler.compile;
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              vi.spyOn(Bundler, "compile").mockImplementation((entry) =>
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
            Effect.sync(() => vi.spyOn(Bundler, "compile")),
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
          expect(bundle.mock.calls.map(([entry]) => entry)).not.toContain(
            path.join(project.root, "confect/_generated/spec.ts"),
          );
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
          expect(yield* Project.writtenFiles(run)).not.toEqual([]);
          expect(yield* Project.writtenFiles(run)).toEqual([]);
          yield* fs.remove(path.join(confect, "_generated"), {
            recursive: true,
          });
          expect(yield* Project.writtenFiles(run)).not.toEqual([]);
          expect(yield* Project.writtenFiles(run)).toEqual([]);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
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
