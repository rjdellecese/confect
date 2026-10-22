import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";
import * as OutputPlan from "@confect/cli/OutputPlan";
import * as OutputPublisher from "@confect/cli/OutputPublisher";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, expectTypeOf, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as ByteSize from "effect/ByteSize";
import * as Option from "effect/Option";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Ref from "effect/Ref";
import * as Project from "./integration/Project";

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const confect = path.join(root, "confect");
  const convex = path.join(root, "convex");
  yield* fs.makeDirectory(confect);
  yield* fs.makeDirectory(convex);
  const directories = Layer.mergeAll(
    Layer.succeed(ProjectRoot, { get: Effect.succeed(root) }),
    Layer.succeed(ConfectDirectory, { get: Effect.succeed(confect) }),
    Layer.succeed(ConvexDirectory, { get: Effect.succeed(convex) }),
  );
  return { root, confect, convex, provide: Effect.provide(directories) };
});

for (const platform of [
  {
    name: "Windows",
    layer: NodePath.layerWin32,
    root: "C:\\project",
    conflicts: true,
  },
  {
    name: "POSIX",
    layer: NodePath.layerPosix,
    root: "/project",
    conflicts: false,
  },
]) {
  layer(platform.layer)(
    `OutputPublisher physical targets on ${platform.name}`,
    (it) => {
      it.effect.each([
        {
          namespace: "TableWrapper",
          relativePath: "notes.ts",
          other: "NOTES.ts",
          directory: "tables",
        },
        {
          namespace: "TableWrapper",
          relativePath: "notes.ts",
          other: "NOTES.ts/child.ts",
          directory: "tables",
        },
        {
          namespace: "TableWrapper",
          relativePath: "notes.ts/child.ts",
          other: "NOTES.ts",
          directory: "tables",
        },
        {
          namespace: "Binding",
          relativePath: "id.ts",
          other: "ID.ts",
          directory: "",
        },
        {
          namespace: "Binding",
          relativePath: "id.ts",
          other: "ID.ts/child.ts",
          directory: "",
        },
      ] as const)(
        "checks $namespace cross-namespace physical collision with $other",
        ({ namespace, relativePath, other, directory }) =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const confect = path.join(platform.root, "confect");
            const convex = path.join(confect, "_generated", directory);
            const target =
              namespace === "Binding"
                ? OutputPlan.Target.Binding({ relativePath })
                : OutputPlan.Target.TableWrapper({ relativePath });
            const writes = yield* Ref.make<ReadonlyArray<string>>([]);
            const inspections = yield* Ref.make(0);
            const missing = FileSystem.makeNoop({});
            const plan = yield* Effect.fromResult(
              OutputPlan.make([
                OutputPlan.Operation.Write({ target, contents: "static" }),
                OutputPlan.Operation.Remove({
                  target: OutputPlan.Target.ConvexModule({
                    relativePath: other,
                  }),
                }),
              ]),
            );
            const result = yield* OutputPublisher.publish(plan).pipe(
              Effect.provideService(ProjectRoot, {
                get: Effect.succeed(platform.root),
              }),
              Effect.provideService(ConfectDirectory, {
                get: Effect.succeed(confect),
              }),
              Effect.provideService(ConvexDirectory, {
                get: Effect.succeed(convex),
              }),
              Effect.provideService(
                FileSystem.FileSystem,
                FileSystem.makeNoop({
                  readLink: (file) =>
                    Ref.update(inspections, (count) => count + 1).pipe(
                      Effect.andThen(missing.readLink(file)),
                    ),
                  makeDirectory: () => Effect.void,
                  writeFileString: (file) =>
                    Ref.update(writes, (previous) => [...previous, file]),
                }),
              ),
              Effect.result,
            );
            if (platform.conflicts) {
              assert(Result.isFailure(result));
              expect(result.failure).toMatchObject({
                _tag: "OutputPathError",
                reason: "ConflictingTarget",
              });
              expect(yield* Ref.get(inspections)).toBe(0);
              expect(yield* Ref.get(writes)).toEqual([]);
            } else {
              assert(Result.isSuccess(result));
              expect(yield* Ref.get(writes)).toEqual([
                path.join(convex, relativePath),
              ]);
            }
          }),
      );

      it.effect.each(["SCHEMA.ts", "nested/HTTP.ts", "_GENERATED/API.ts"])(
        "checks reserved-equivalent writes and removals for %s before filesystem access",
        (relativePath) =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const convex = path.join(platform.root, "convex");
            const target = OutputPlan.Target.ConvexModule({ relativePath });
            for (const operation of [
              OutputPlan.Operation.Write({ target, contents: "contents" }),
              OutputPlan.Operation.Remove({ target }),
            ]) {
              const inspections = yield* Ref.make(0);
              const writes = yield* Ref.make<ReadonlyArray<string>>([]);
              const plan = yield* Effect.fromResult(
                OutputPlan.make([operation]),
              );
              const missing = FileSystem.makeNoop({});
              const result = yield* OutputPublisher.publish(plan).pipe(
                Effect.provideService(ProjectRoot, {
                  get: Effect.succeed(platform.root),
                }),
                Effect.provideService(ConfectDirectory, {
                  get: Effect.succeed(path.join(platform.root, "confect")),
                }),
                Effect.provideService(ConvexDirectory, {
                  get: Effect.succeed(convex),
                }),
                Effect.provideService(
                  FileSystem.FileSystem,
                  FileSystem.makeNoop({
                    readLink: (file) =>
                      Ref.update(inspections, (count) => count + 1).pipe(
                        Effect.andThen(missing.readLink(file)),
                      ),
                    makeDirectory: () => Effect.void,
                    writeFileString: (file) =>
                      Ref.update(writes, (previous) => [...previous, file]),
                  }),
                ),
                Effect.result,
              );
              if (platform.conflicts) {
                assert(Result.isFailure(result));
                expect(result.failure).toMatchObject({
                  _tag: "OutputPathError",
                  reason: "ReservedPath",
                  path: path.join(convex, relativePath),
                });
                expect(yield* Ref.get(inspections)).toBe(0);
                expect(yield* Ref.get(writes)).toEqual([]);
              } else {
                assert(Result.isSuccess(result));
                expect(yield* Ref.get(inspections)).toBe(1);
                expect(yield* Ref.get(writes)).toEqual(
                  operation._tag === "Write"
                    ? [path.join(convex, relativePath)]
                    : [],
                );
              }
            }
          }),
      );

      it.effect(
        "excludes reserved-equivalent discoveries only under Windows path semantics",
        () =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const convex = path.join(platform.root, "convex");
            const nested = path.join(convex, "nested");
            const generated = path.join(convex, "_GENERATED");
            const directories = HashSet.make(
              platform.root,
              convex,
              nested,
              generated,
            );
            const observed = yield* OutputPublisher.discover(
              "ConvexModule",
            ).pipe(
              Effect.provideService(ProjectRoot, {
                get: Effect.succeed(platform.root),
              }),
              Effect.provideService(ConfectDirectory, {
                get: Effect.succeed(path.join(platform.root, "confect")),
              }),
              Effect.provideService(ConvexDirectory, {
                get: Effect.succeed(convex),
              }),
              Effect.provideService(
                FileSystem.FileSystem,
                FileSystem.makeNoop({
                  readDirectory: (file) =>
                    Effect.succeed(
                      file === convex
                        ? ["SCHEMA.ts", "nested", "_GENERATED", "notes.ts"]
                        : file === nested
                          ? ["HTTP.ts"]
                          : ["API.ts"],
                    ),
                  readLink: (file) =>
                    Effect.fail(
                      PlatformError.systemError({
                        _tag: "Unknown",
                        module: "FileSystem",
                        method: "readLink",
                        pathOrDescriptor: file,
                        cause: { code: "EINVAL" },
                      }),
                    ),
                  realPath: (file) => Effect.succeed(file),
                  stat: (file) =>
                    Effect.succeed({
                      type: HashSet.has(directories, file)
                        ? "Directory"
                        : "File",
                      mtime: Option.none(),
                      atime: Option.none(),
                      birthtime: Option.none(),
                      dev: 0,
                      ino: Option.none(),
                      mode: 0,
                      nlink: Option.none(),
                      uid: Option.none(),
                      gid: Option.none(),
                      rdev: Option.none(),
                      size: ByteSize.zero,
                      blksize: Option.none(),
                      blocks: Option.none(),
                    }),
                }),
              ),
            );
            expect(
              observed.map(({ relativePath }) => relativePath).sort(),
            ).toEqual(
              platform.conflicts
                ? ["notes.ts"]
                : [
                    "SCHEMA.ts",
                    "_GENERATED/API.ts",
                    "nested/HTTP.ts",
                    "notes.ts",
                  ],
            );
          }),
      );

      it.effect.each([
        {
          name: "duplicate writes",
          first: "notes.ts",
          second: "NOTES.ts",
          firstRemove: false,
          secondRemove: false,
        },
        {
          name: "write and removal",
          first: "notes.ts",
          second: "NOTES.ts",
          firstRemove: false,
          secondRemove: true,
        },
        {
          name: "duplicate removals",
          first: "notes.ts",
          second: "NOTES.ts",
          firstRemove: true,
          secondRemove: true,
        },
        {
          name: "parent then child",
          first: "notes.ts",
          second: "NOTES.ts/child.ts",
          firstRemove: false,
          secondRemove: false,
        },
        {
          name: "child then parent",
          first: "notes.ts/child.ts",
          second: "NOTES.ts",
          firstRemove: false,
          secondRemove: false,
        },
        {
          name: "different parent casing",
          first: "Nested/notes.ts",
          second: "nested/NOTES.ts",
          firstRemove: false,
          secondRemove: false,
        },
      ])(
        "handles $name before publication",
        ({ first, second, firstRemove, secondRemove }) =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const writes = yield* Ref.make<ReadonlyArray<string>>([]);
            const inspections = yield* Ref.make(0);
            const plan = yield* Effect.fromResult(
              OutputPlan.make(
                [
                  { relativePath: first, remove: firstRemove },
                  { relativePath: second, remove: secondRemove },
                ].map(({ relativePath, remove }) => {
                  const target = OutputPlan.Target.ConvexModule({
                    relativePath,
                  });
                  return remove
                    ? OutputPlan.Operation.Remove({ target })
                    : OutputPlan.Operation.Write({
                        target,
                        contents: "contents",
                      });
                }),
              ),
            );
            const missing = FileSystem.makeNoop({});
            const result = yield* OutputPublisher.publish(plan).pipe(
              Effect.provideService(ProjectRoot, {
                get: Effect.succeed(platform.root),
              }),
              Effect.provideService(ConfectDirectory, {
                get: Effect.succeed(path.join(platform.root, "confect")),
              }),
              Effect.provideService(ConvexDirectory, {
                get: Effect.succeed(path.join(platform.root, "convex")),
              }),
              Effect.provideService(
                FileSystem.FileSystem,
                FileSystem.makeNoop({
                  readLink: (file) =>
                    Ref.update(inspections, (count) => count + 1).pipe(
                      Effect.andThen(missing.readLink(file)),
                    ),
                  makeDirectory: () => Effect.void,
                  writeFileString: (file) =>
                    Ref.update(writes, (previous) => [...previous, file]),
                }),
              ),
              Effect.result,
            );
            if (platform.conflicts) {
              assert(Result.isFailure(result));
              expect(result.failure).toMatchObject({
                _tag: "OutputPathError",
                reason: "ConflictingTarget",
              });
              expect(yield* Ref.get(writes)).toEqual([]);
              expect(yield* Ref.get(inspections)).toBe(0);
            } else {
              assert(Result.isSuccess(result));
              expect(yield* Ref.get(writes)).toHaveLength(
                Number(!firstRemove) + Number(!secondRemove),
              );
              expect(yield* Ref.get(inspections)).toBe(1);
            }
          }),
      );
    },
  );
}

const metadataCalls = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const calls = yield* Ref.make<
      ReadonlyArray<{ readonly method: string; readonly file: string }>
    >([]);
    const record = (method: string, file: string) =>
      Ref.update(calls, (previous) => [...previous, { method, file }]);
    const value = yield* effect.pipe(
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        readLink: (file) =>
          record("readLink", file).pipe(Effect.andThen(fs.readLink(file))),
        realPath: (file) =>
          record("realPath", file).pipe(Effect.andThen(fs.realPath(file))),
        stat: (file) =>
          record("stat", file).pipe(Effect.andThen(fs.stat(file))),
        exists: (file) =>
          record("exists", file).pipe(Effect.andThen(fs.exists(file))),
        readDirectory: (...args) =>
          record("readDirectory", args[0]).pipe(
            Effect.andThen(fs.readDirectory(...args)),
          ),
      }),
    );
    return { value, calls: yield* Ref.get(calls) };
  });

layer(NodeServices.layer)("OutputPublisher", (it) => {
  it.effect(
    "publishes bounded static outputs and cleans up only discovered table TypeScript files",
    () =>
      Effect.gen(function* () {
        expectTypeOf<
          Parameters<typeof OutputPublisher.discover>[0]
        >().toEqualTypeOf<"Registry" | "ConvexModule" | "TableWrapper">();
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const directory = path.join(project.confect, "_generated");
        const tables = path.join(directory, "tables");
        for (const relative of [
          "old.ts",
          "nested/stale.ts",
          "keep.txt",
          "nested/keep.js",
        ]) {
          const file = path.join(tables, relative);
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, "sentinel");
        }
        for (const relative of [
          "api.ts",
          "spec.ts",
          "registeredFunctions/keep.ts",
        ]) {
          const file = path.join(directory, relative);
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, "unowned");
        }
        const desired = [
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.TableWrapper({
              relativePath: "nested/current.ts",
            }),
            contents: "table\n",
          }),
          ...(
            [
              "id.ts",
              "schema.ts",
              "convexSchema.ts",
              "docs.ts",
              "services.ts",
            ] as const
          ).map((relativePath) =>
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.Binding({ relativePath }),
              contents: relativePath,
            }),
          ),
        ];
        const discovered = yield* metadataCalls(
          project.provide(OutputPublisher.discover("TableWrapper")),
        );
        expect(
          discovered.value.map(({ relativePath }) => relativePath).sort(),
        ).toEqual(["nested/stale.ts", "old.ts"]);
        const plan = yield* Effect.fromResult(
          OutputPlan.diff(desired, discovered.value),
        );
        const published = yield* metadataCalls(
          project.provide(OutputPublisher.publish(plan)),
        );
        for (const { calls } of [discovered, published]) {
          for (const method of ["readLink", "realPath", "stat"]) {
            const files = calls
              .filter((call) => call.method === method)
              .map((call) => call.file);
            expect(HashSet.size(HashSet.fromIterable(files))).toBe(
              files.length,
            );
          }
        }
        for (const { target, contents } of desired) {
          expect(
            yield* fs.readFileString(
              path.join(
                target._tag === "TableWrapper" ? tables : directory,
                target.relativePath,
              ),
            ),
          ).toBe(contents);
        }
        expect(
          yield* Project.writtenFiles(
            project.provide(OutputPublisher.publish(plan)),
          ),
        ).toEqual([]);
        expect(yield* fs.exists(path.join(tables, "old.ts"))).toBe(false);
        expect(yield* fs.exists(path.join(tables, "nested/stale.ts"))).toBe(
          false,
        );
        expect(yield* fs.readFileString(path.join(tables, "keep.txt"))).toBe(
          "sentinel",
        );
        expect(
          yield* fs.readFileString(path.join(tables, "nested/keep.js")),
        ).toBe("sentinel");
        for (const relative of [
          "api.ts",
          "spec.ts",
          "registeredFunctions/keep.ts",
        ]) {
          expect(yield* fs.readFileString(path.join(directory, relative))).toBe(
            "unowned",
          );
        }
        const cleanup = yield* Effect.fromResult(
          OutputPlan.diff(
            [],
            desired.map(({ target }) => target),
          ),
        );
        yield* project.provide(OutputPublisher.publish(cleanup));
        yield* project.provide(OutputPublisher.publish(cleanup));
        expect(
          yield* project.provide(OutputPublisher.discover("TableWrapper")),
        ).toEqual([]);
        expect(yield* fs.exists(path.join(directory, "id.ts"))).toBe(false);
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    {
      namespace: "TableWrapper",
      alias: "tables/nested/notes.ts",
      kind: "file",
    },
    {
      namespace: "TableWrapper",
      alias: "tables/nested/notes.ts",
      kind: "dangling",
    },
    { namespace: "TableWrapper", alias: "tables/nested", kind: "directory" },
    { namespace: "TableWrapper", alias: "tables", kind: "directory" },
    { namespace: "Binding", alias: "id.ts", kind: "file" },
    { namespace: "Binding", alias: "id.ts", kind: "dangling" },
    { namespace: "Binding", alias: "", kind: "directory" },
  ] as const)(
    "rejects $namespace $kind alias at $alias before any publication",
    ({ namespace, alias: relativeAlias, kind }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const destination = path.join(project.root, "untouched");
        if (kind === "file") yield* fs.writeFileString(destination, "sentinel");
        if (kind === "directory") {
          yield* fs.makeDirectory(destination);
          yield* fs.writeFileString(
            path.join(destination, "keep.ts"),
            "sentinel",
          );
        }
        const alias = path.join(project.confect, "_generated", relativeAlias);
        yield* fs.makeDirectory(path.dirname(alias), { recursive: true });
        yield* fs.symlink(destination, alias);
        const target =
          namespace === "Binding"
            ? OutputPlan.Target.Binding({ relativePath: "id.ts" })
            : OutputPlan.Target.TableWrapper({
                relativePath: "nested/notes.ts",
              });
        for (const operation of [
          OutputPlan.Operation.Write({ target, contents: "overwrite" }),
          OutputPlan.Operation.Remove({ target }),
        ]) {
          const plan = yield* Effect.fromResult(
            OutputPlan.make([
              OutputPlan.Operation.Write({
                target: OutputPlan.Target.ConvexModule({
                  relativePath: "first.ts",
                }),
                contents: "first",
              }),
              operation,
            ]),
          );
          const result = yield* project
            .provide(OutputPublisher.publish(plan))
            .pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                readFileString: () =>
                  Effect.die("Must not read through aliases"),
                writeFileString: () =>
                  Effect.die("Must preflight all targets before writing"),
                remove: () =>
                  Effect.die("Must preflight all targets before removing"),
              }),
              Effect.result,
            );
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "OutputPathError",
            reason: "SymbolicLink",
            path: alias,
          });
        }
        if (namespace === "TableWrapper") {
          const result = yield* project
            .provide(OutputPublisher.discover("TableWrapper"))
            .pipe(Effect.result);
          if (relativeAlias === "tables/nested") {
            assert(Result.isSuccess(result));
            expect(result.success).toEqual([]);
          } else {
            assert(Result.isFailure(result));
            expect(result.failure).toMatchObject({
              reason: "SymbolicLink",
              path: alias,
            });
          }
        }
        expect(yield* fs.readLink(alias)).toBe(destination);
        if (kind !== "dangling")
          expect(
            yield* fs.readFileString(
              kind === "file" ? destination : path.join(destination, "keep.ts"),
            ),
          ).toBe("sentinel");
        expect(yield* fs.exists(path.join(project.convex, "first.ts"))).toBe(
          false,
        );
      }).pipe(Effect.scoped),
  );

  it.effect.each(["readLink", "realPath", "stat", "readDirectory"] as const)(
    "propagates static output %s observation failures without modifying files",
    (method) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const tables = path.join(project.confect, "_generated/tables");
        yield* fs.makeDirectory(tables, { recursive: true });
        for (const namespace of ["TableWrapper", "Binding"] as const) {
          const target =
            namespace === "TableWrapper"
              ? OutputPlan.Target.TableWrapper({ relativePath: "notes.ts" })
              : OutputPlan.Target.Binding({ relativePath: "id.ts" });
          const file = path.join(
            namespace === "TableWrapper" ? tables : path.dirname(tables),
            target.relativePath,
          );
          yield* fs.writeFileString(file, "sentinel");
          const plan = yield* Effect.fromResult(
            OutputPlan.make([OutputPlan.Operation.Remove({ target })]),
          );
          const failure = PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method,
            pathOrDescriptor: method === "readDirectory" ? tables : file,
            cause: { code: "EACCES" },
          });
          const failing: FileSystem.FileSystem = {
            ...fs,
            readLink: (entry) =>
              method === "readLink" && entry === file
                ? Effect.fail(failure)
                : fs.readLink(entry),
            realPath: (entry) =>
              method === "realPath" && entry === file
                ? Effect.fail(failure)
                : fs.realPath(entry),
            stat: (entry) =>
              method === "stat" && entry === file
                ? Effect.fail(failure)
                : fs.stat(entry),
            readDirectory: (entry, options) =>
              method === "readDirectory" && entry === tables
                ? Effect.fail(failure)
                : fs.readDirectory(entry, options),
            writeFileString: () =>
              Effect.die("Must not write after an observation failure"),
            remove: () =>
              Effect.die("Must not remove after an observation failure"),
          };
          const runs = [
            ...(method === "readDirectory"
              ? []
              : [OutputPublisher.publish(plan)]),
            ...(namespace === "TableWrapper"
              ? [OutputPublisher.discover("TableWrapper").pipe(Effect.asVoid)]
              : []),
          ];
          for (const run of runs) {
            const result = yield* project
              .provide(run)
              .pipe(
                Effect.provideService(FileSystem.FileSystem, failing),
                Effect.result,
              );
            assert(Result.isFailure(result));
            expect(result.failure).toBe(failure);
          }
          expect(yield* fs.readFileString(file)).toBe("sentinel");
        }
      }).pipe(Effect.scoped),
  );

  it.effect("succeeds when the target convex module does not exist", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const project = yield* fixture;
      const modulePath = path.join(project.convex, "does/not/exist.ts");
      const plan = yield* Effect.fromResult(
        OutputPlan.make([
          OutputPlan.Operation.Remove({
            target: OutputPlan.Target.ConvexModule({
              relativePath: "does/not/exist.ts",
            }),
          }),
        ]),
      );
      expect(yield* fs.exists(modulePath)).toBe(false);
      yield* project.provide(OutputPublisher.publish(plan));
      expect(yield* fs.exists(modulePath)).toBe(false);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "publishes and discovers trusted sibling output roots outside the project",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const projectRoot = path.join(project.root, "application");
        yield* fs.makeDirectory(projectRoot);
        const registry = OutputPlan.Target.Registry({
          relativePath: "nested/notes.ts",
        });
        const module = OutputPlan.Target.ConvexModule({
          relativePath: "nested/notes.ts",
        });
        const table = OutputPlan.Target.TableWrapper({
          relativePath: "nested/notes.ts",
        });
        const binding = OutputPlan.Target.Binding({ relativePath: "id.ts" });
        const plan = yield* Effect.fromResult(
          OutputPlan.make([
            OutputPlan.Operation.Write({
              target: registry,
              contents: "registry",
            }),
            OutputPlan.Operation.Write({ target: module, contents: "module" }),
            OutputPlan.Operation.Write({ target: table, contents: "table" }),
            OutputPlan.Operation.Write({
              target: binding,
              contents: "binding",
            }),
          ]),
        );
        yield* project.provide(
          Effect.gen(function* () {
            yield* OutputPublisher.publish(plan);
            expect(yield* OutputPublisher.discover("Registry")).toEqual([
              registry,
            ]);
            expect(yield* OutputPublisher.discover("ConvexModule")).toEqual([
              module,
            ]);
            expect(yield* OutputPublisher.discover("TableWrapper")).toEqual([
              table,
            ]);
          }).pipe(
            Effect.provideService(ProjectRoot, {
              get: Effect.succeed(projectRoot),
            }),
          ),
        );
        expect(
          yield* fs.readFileString(
            path.join(
              project.confect,
              "_generated/registeredFunctions/nested/notes.ts",
            ),
          ),
        ).toBe("registry");
        expect(
          yield* fs.readFileString(
            path.join(project.confect, "_generated/tables/nested/notes.ts"),
          ),
        ).toBe("table");
        expect(
          yield* fs.readFileString(
            path.join(project.confect, "_generated/id.ts"),
          ),
        ).toBe("binding");
        expect(
          yield* fs.readFileString(
            path.join(project.convex, "nested/notes.ts"),
          ),
        ).toBe("module");
        const escaped = yield* project
          .provide(
            OutputPublisher.publish(plan).pipe(
              Effect.provideService(ProjectRoot, {
                get: Effect.succeed(projectRoot),
              }),
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                realPath: (file) =>
                  file === project.convex
                    ? Effect.succeed(path.join(project.root, "elsewhere"))
                    : fs.realPath(file),
                writeFileString: () =>
                  Effect.die("Must not publish after a resolved escape"),
                readFileString: () =>
                  Effect.die("Must not read after a resolved escape"),
              }),
            ),
          )
          .pipe(Effect.result);
        assert(Result.isFailure(escaped));
        expect(escaped.failure).toMatchObject({
          _tag: "OutputPathError",
          reason: "EscapedPath",
          path: project.convex,
        });
      }).pipe(Effect.scoped),
  );

  it.effect.each(["publish", "discover"] as const)(
    "inspects distinct paths once per %s invocation for many deep siblings",
    (operation) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const directory = path.join(project.convex, "a/b/c/d/e/f");
        yield* fs.makeDirectory(directory, { recursive: true });
        const writes = Array.from({ length: 128 }, (_, index) =>
          OutputPlan.Operation.Write({
            target: OutputPlan.Target.ConvexModule({
              relativePath: `a/b/c/d/e/f/notes${index}.ts`,
            }),
            contents: "unchanged",
          }),
        );
        for (const { target, contents } of writes)
          yield* fs.writeFileString(
            path.join(project.convex, target.relativePath),
            contents,
          );
        const plan = yield* Effect.fromResult(OutputPlan.make(writes));
        const run =
          operation === "publish"
            ? OutputPublisher.publish(plan)
            : OutputPublisher.discover("ConvexModule").pipe(Effect.asVoid);
        for (let invocation = 0; invocation < 2; invocation++) {
          const { calls } = yield* metadataCalls(project.provide(run));
          for (const method of ["readLink", "realPath", "stat"]) {
            const files = calls
              .filter((call) => call.method === method)
              .map((call) => call.file);
            expect(files).toHaveLength(128 + 8);
            expect(HashSet.size(HashSet.fromIterable(files))).toBe(
              files.length,
            );
          }
          for (const method of ["exists", "readDirectory"]) {
            const files = calls
              .filter((call) => call.method === method)
              .map((call) => call.file);
            expect(HashSet.size(HashSet.fromIterable(files))).toBe(
              files.length,
            );
          }
        }
        const alias = path.join(directory, "notes0.ts");
        const destination = path.join(project.root, "untouched");
        yield* fs.writeFileString(destination, "sentinel");
        yield* fs.remove(alias);
        yield* fs.symlink(destination, alias);
        const result = yield* project.provide(run).pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "OutputPathError",
          reason: "SymbolicLink",
          path: alias,
        });
        expect(yield* fs.readFileString(destination)).toBe("sentinel");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects namespace roots that resolve different targets to the same file",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const plan = yield* Effect.fromResult(
          OutputPlan.make([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.Registry({ relativePath: "notes.ts" }),
              contents: "registry",
            }),
            OutputPlan.Operation.Remove({
              target: OutputPlan.Target.ConvexModule({
                relativePath: "notes.ts",
              }),
            }),
          ]),
        );
        const result = yield* project
          .provide(
            OutputPublisher.publish(plan).pipe(
              Effect.provideService(ConvexDirectory, {
                get: Effect.succeed(
                  path.join(project.confect, "_generated/registeredFunctions"),
                ),
              }),
            ),
          )
          .pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "OutputPathError",
          reason: "ConflictingTarget",
        });
        expect(yield* fs.exists(path.join(project.confect, "_generated"))).toBe(
          false,
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects an alias above the configured output root without reading or writing through it",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const outside = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(path.join(outside, "nested"));
        yield* fs.symlink(outside, path.join(project.root, "alias"));
        const plan = yield* Effect.fromResult(
          OutputPlan.make([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexModule({
                relativePath: "notes.ts",
              }),
              contents: "module",
            }),
          ]),
        );
        const result = yield* project
          .provide(
            OutputPublisher.publish(plan).pipe(
              Effect.provideService(ConvexDirectory, {
                get: Effect.succeed(path.join(project.root, "alias/nested")),
              }),
            ),
          )
          .pipe(Effect.result);
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "OutputPathError",
          reason: "SymbolicLink",
          path: path.join(project.root, "alias"),
        });
        expect(yield* fs.exists(path.join(outside, "nested/notes.ts"))).toBe(
          false,
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "publishes both namespaces, creates parents, and skips unchanged bytes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const registry = OutputPlan.Target.Registry({
          relativePath: "nested/notes.ts",
        });
        const module = OutputPlan.Target.ConvexModule({
          relativePath: "nested/notes.ts",
        });
        const plan = yield* Effect.fromResult(
          OutputPlan.make([
            OutputPlan.Operation.Write({
              target: registry,
              contents: "registry\n",
            }),
            OutputPlan.Operation.Write({
              target: module,
              contents: "module\n",
            }),
          ]),
        );
        const first = yield* Project.writtenFiles(
          project.provide(OutputPublisher.publish(plan)),
        );
        expect(first).toHaveLength(2);
        expect(
          yield* fs.readFileString(
            path.join(
              project.confect,
              "_generated/registeredFunctions/nested/notes.ts",
            ),
          ),
        ).toBe("registry\n");
        expect(
          yield* fs.readFileString(
            path.join(project.convex, "nested/notes.ts"),
          ),
        ).toBe("module\n");
        expect(
          yield* Project.writtenFiles(
            project.provide(OutputPublisher.publish(plan)),
          ),
        ).toEqual([]);
        const removed = yield* Effect.fromResult(
          OutputPlan.make([OutputPlan.Operation.Remove({ target: registry })]),
        );
        yield* project.provide(OutputPublisher.publish(removed));
        yield* project.provide(OutputPublisher.publish(removed));
        expect(
          yield* fs.exists(
            path.join(
              project.confect,
              "_generated/registeredFunctions/nested/notes.ts",
            ),
          ),
        ).toBe(false);
        expect(
          yield* fs.exists(path.join(project.convex, "nested/notes.ts")),
        ).toBe(true);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "discovers actual obsolete outputs without claiming reserved or non-TypeScript files",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        for (const relative of [
          "schema.ts",
          "nested/http.ts",
          "crons.ts",
          "auth.config.ts",
          "convex.config.ts",
          "_generated/api.ts",
          "nested/_generated/server.ts",
          "keep.txt",
          "obsolete.ts",
          "nested/old.ts",
        ]) {
          const file = path.join(project.convex, relative);
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, "sentinel");
        }
        const owned = yield* project.provide(
          OutputPublisher.discover("ConvexModule"),
        );
        expect(owned.map(({ relativePath }) => relativePath).sort()).toEqual([
          "nested/old.ts",
          "obsolete.ts",
        ]);
        yield* project.provide(
          OutputPublisher.publish(
            yield* Effect.fromResult(OutputPlan.diff([], owned)),
          ),
        );
        expect(yield* fs.exists(path.join(project.convex, "obsolete.ts"))).toBe(
          false,
        );
        expect(
          yield* fs.readFileString(
            path.join(project.convex, "_generated/api.ts"),
          ),
        ).toBe("sentinel");
        expect(
          yield* fs.readFileString(path.join(project.convex, "nested/http.ts")),
        ).toBe("sentinel");
        expect(
          yield* project.provide(OutputPublisher.discover("Registry")),
        ).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.effect.each(["Registry", "ConvexModule", "TableWrapper"] as const)(
    "preserves aliases outside %s ownership without following them",
    (namespace) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const directory =
          namespace === "Registry"
            ? path.join(project.confect, "_generated/registeredFunctions")
            : namespace === "TableWrapper"
              ? path.join(project.confect, "_generated/tables")
              : project.convex;
        const target = path.join(project.root, "untouched");
        yield* fs.makeDirectory(target);
        yield* fs.writeFileString(
          path.join(target, "preserved.ts"),
          "sentinel",
        );
        const aliases = [
          "keep.txt",
          "linked-directory",
          ...(namespace === "ConvexModule"
            ? ["schema.ts", "nested/http.ts", "_generated/api.ts"]
            : []),
        ].map((relative) => path.join(directory, relative));
        for (const alias of aliases) {
          yield* fs.makeDirectory(path.dirname(alias), { recursive: true });
          yield* fs.symlink(target, alias);
        }
        const observed = yield* project
          .provide(OutputPublisher.discover(namespace))
          .pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: (file) =>
                aliases.includes(file)
                  ? Effect.die("resolved an unowned alias")
                  : fs.realPath(file),
              stat: (file) =>
                aliases.includes(file)
                  ? Effect.die("followed an unowned alias")
                  : fs.stat(file),
              readDirectory: (file, options) =>
                aliases.includes(file) || file === target
                  ? Effect.die("traversed an unowned alias")
                  : fs.readDirectory(file, options),
            }),
          );
        expect(observed).toEqual([]);
        for (const alias of aliases)
          expect(yield* fs.readLink(alias)).not.toBe("");
        expect(
          yield* fs.readFileString(path.join(target, "preserved.ts")),
        ).toBe("sentinel");
      }).pipe(Effect.scoped),
  );

  it.effect.each(["file", "directory", "dangling"] as const)(
    "rejects a %s alias before reading its content or publishing earlier work",
    (kind) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const destination = path.join(project.root, "outside");
        const alias =
          kind === "directory"
            ? path.join(project.convex, "nested")
            : path.join(project.convex, "nested/notes.ts");
        if (kind === "directory") yield* fs.makeDirectory(destination);
        else if (kind === "file")
          yield* fs.writeFileString(destination, "sentinel");
        if (kind !== "directory")
          yield* fs.makeDirectory(path.join(project.convex, "nested"));
        yield* fs.symlink(destination, alias);
        const plan = yield* Effect.fromResult(
          OutputPlan.make([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.Registry({ relativePath: "first.ts" }),
              contents: "first",
            }),
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexModule({
                relativePath: "nested/notes.ts",
              }),
              contents: "overwrite",
            }),
          ]),
        );
        const result = yield* project
          .provide(OutputPublisher.publish(plan))
          .pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFileString: () => Effect.die("Must not read alias contents"),
              writeFileString: () =>
                Effect.die("Must validate all targets before writing"),
            }),
            Effect.result,
          );
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "OutputPathError",
          reason: "SymbolicLink",
          path: alias,
        });
        expect(yield* fs.exists(path.join(project.confect, "_generated"))).toBe(
          false,
        );
        if (kind === "file")
          expect(yield* fs.readFileString(destination)).toBe("sentinel");
        const discovered = yield* project
          .provide(OutputPublisher.discover("ConvexModule"))
          .pipe(Effect.result);
        if (kind === "directory") {
          assert(Result.isSuccess(discovered));
          expect(discovered.success).toEqual([]);
        } else {
          assert(Result.isFailure(discovered));
          expect(discovered.failure).toMatchObject({ reason: "SymbolicLink" });
        }
      }).pipe(Effect.scoped),
  );

  it.effect(
    "leaves successful writes after failure and safely retries publication",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fixture;
        const target = path.join(project.convex, "notes.ts");
        const plan = yield* Effect.fromResult(
          OutputPlan.make([
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.Registry({ relativePath: "notes.ts" }),
              contents: "registry",
            }),
            OutputPlan.Operation.Write({
              target: OutputPlan.Target.ConvexModule({
                relativePath: "notes.ts",
              }),
              contents: "module",
            }),
          ]),
        );
        const failure = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: "writeFileString",
          pathOrDescriptor: target,
          cause: { code: "EACCES" },
        });
        const result = yield* project
          .provide(OutputPublisher.publish(plan))
          .pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              writeFileString: (...args) =>
                args[0] === target
                  ? Effect.fail(failure)
                  : fs.writeFileString(...args),
            }),
            Effect.result,
          );
        assert(Result.isFailure(result));
        expect(result.failure).toBe(failure);
        expect(
          yield* fs.readFileString(
            path.join(
              project.confect,
              "_generated/registeredFunctions/notes.ts",
            ),
          ),
        ).toBe("registry");
        const retry = yield* Project.writtenFiles(
          project.provide(OutputPublisher.publish(plan)),
        );
        expect(retry).toEqual([target]);
        expect(yield* fs.readFileString(target)).toBe("module");
      }).pipe(Effect.scoped),
  );
});
