import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import * as EntryPoint from "@confect/cli/EntryPoint";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import { TableModulePath } from "@confect/cli/TableModulePath";
import * as Option from "effect/Option";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";

it("refines optional entries without including spec, impl, table, or config entries", () => {
  const entries: Array<EntryPoint.Kind> = [
    EntryPoint.Kind.Http({ relativePath: "http.ts" }),
    EntryPoint.Kind.Crons({ relativePath: "crons.ts" }),
    EntryPoint.Kind.Auth({ relativePath: "auth.ts" }),
    EntryPoint.Kind.Spec({
      relativePath: SpecModulePath.make("notes.spec.ts"),
    }),
    EntryPoint.Kind.Impl({
      relativePath: ImplModulePath.make("notes.impl.ts"),
    }),
    EntryPoint.Kind.Table({
      relativePath: TableModulePath.make("tables/notes.ts"),
    }),
    EntryPoint.Kind.Config(),
  ];
  const optional = entries.filter(EntryPoint.isOptional);
  expect(optional.map((entry) => entry._tag)).toEqual([
    "Http",
    "Crons",
    "Auth",
  ]);
  expectTypeOf(optional).toEqualTypeOf<
    Array<Extract<EntryPoint.Kind, { readonly _tag: EntryPoint.OptionalFile }>>
  >();
});

it.effect("discovers typed entries with logical and canonical paths", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const confect = path.resolve("/project/confect");
    const convex = path.resolve("/project/convex");
    const files = [
      "notes.spec.ts",
      "notes.impl.ts",
      path.join("tables", "notes.ts"),
      "helper.ts",
    ];
    const existing = HashSet.make(
      path.join(confect, "http.ts"),
      path.join(confect, "notes.spec.ts"),
      path.join(confect, "notes.impl.ts"),
      path.join(confect, "tables"),
      path.join(confect, "tables", "notes.ts"),
      path.join(convex, "convex.config.ts"),
    );
    const entries = yield* EntryPoint.discover.pipe(
      Effect.provideService(ConfectDirectory, { get: Effect.succeed(confect) }),
      Effect.provideService(ConvexDirectory, { get: Effect.succeed(convex) }),
      Effect.provide(
        FileSystem.layerNoop({
          exists: (file) => Effect.succeed(HashSet.has(existing, file)),
          readDirectory: (directory) =>
            Effect.succeed(
              directory === path.join(confect, "tables") ? ["notes.ts"] : files,
            ),
          realPath: (file) =>
            Effect.succeed(path.resolve("/canonical", path.basename(file))),
        }),
      ),
    );
    expect(entries.map((entry) => entry._tag)).toEqual([
      "Http",
      "Config",
      "Spec",
      "Impl",
      "Table",
    ]);
    expect(entries.map((entry) => entry.absolutePath)).toEqual([
      path.join(confect, "http.ts"),
      path.join(convex, "convex.config.ts"),
      path.join(confect, "notes.spec.ts"),
      path.join(confect, "notes.impl.ts"),
      path.join(confect, "tables", "notes.ts"),
    ]);
    for (const entry of entries)
      expect(entry.inputPath).toBe(
        path.resolve("/canonical", path.basename(entry.absolutePath)),
      );
    expect(files).toEqual([
      "notes.spec.ts",
      "notes.impl.ts",
      path.join("tables", "notes.ts"),
      "helper.ts",
    ]);
  }).pipe(Effect.provide(NodePath.layer)),
);

it.effect.each([1, 2, 3])(
  "restarts discovery when scan %s loses a directory without dropping surviving entries",
  (failedScan) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const confect = path.resolve("/project/confect");
      const convex = path.resolve("/project/convex");
      const tables = path.join(confect, "tables");
      const scans = yield* Ref.make(0);
      const removed = yield* Ref.make(false);
      const entries = yield* EntryPoint.discover.pipe(
        Effect.provideService(ConfectDirectory, {
          get: Effect.succeed(confect),
        }),
        Effect.provideService(ConvexDirectory, { get: Effect.succeed(convex) }),
        Effect.provide(
          FileSystem.layerNoop({
            exists: (file) =>
              Ref.get(removed).pipe(
                Effect.map((gone) =>
                  file === tables || file === path.join(tables, "notes.ts")
                    ? !gone
                    : file === path.join(confect, "notes.spec.ts") ||
                      file === path.join(confect, "notes.impl.ts"),
                ),
              ),
            readDirectory: (directory) =>
              Effect.gen(function* () {
                const scan = yield* Ref.updateAndGet(
                  scans,
                  (count) => count + 1,
                );
                if (scan === failedScan) {
                  yield* Ref.set(removed, true);
                  return yield* PlatformError.systemError({
                    _tag: "NotFound",
                    module: "FileSystem",
                    method: "readDirectory",
                    pathOrDescriptor: directory,
                  });
                }
                return directory === tables
                  ? ["notes.ts"]
                  : ["notes.spec.ts", "notes.impl.ts"];
              }),
            realPath: Effect.succeed,
          }),
        ),
      );
      expect(entries.map((entry) => entry._tag)).toEqual(["Spec", "Impl"]);
      expect(entries.map((entry) => entry.absolutePath)).toEqual([
        path.join(confect, "notes.spec.ts"),
        path.join(confect, "notes.impl.ts"),
      ]);
      expect(yield* Ref.get(scans)).toBe(failedScan + 2);
    }).pipe(Effect.provide(NodePath.layer)),
);

it.effect.each([
  { reason: "NotFound" as const, attempts: 4 },
  { reason: "PermissionDenied" as const, attempts: 1 },
])(
  "preserves $reason discovery errors after $attempts attempts",
  ({ reason, attempts }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const confect = path.resolve("/project/confect");
      const scans = yield* Ref.make(0);
      const error = PlatformError.systemError({
        _tag: reason,
        module: "FileSystem",
        method: "readDirectory",
        pathOrDescriptor: confect,
      });
      const result = yield* EntryPoint.discover.pipe(
        Effect.provideService(ConfectDirectory, {
          get: Effect.succeed(confect),
        }),
        Effect.provideService(ConvexDirectory, {
          get: Effect.succeed(path.resolve("/project/convex")),
        }),
        Effect.provide(
          FileSystem.layerNoop({
            exists: () => Effect.succeed(false),
            readDirectory: () =>
              Ref.update(scans, (count) => count + 1).pipe(
                Effect.andThen(Effect.fail(error)),
              ),
          }),
        ),
        Effect.result,
      );
      expect(result).toEqual(Result.fail(error));
      expect(yield* Ref.get(scans)).toBe(attempts);
    }).pipe(Effect.provide(NodePath.layer)),
);

it.each(["notes.impl.ts", "groups/notes.impl.ts", "groups\\notes.impl.ts"])(
  "parses %s into an implementation entry",
  (relativePath) => {
    const parsed = EntryPoint.parse(relativePath);
    assert(Option.isSome(parsed));
    expect(parsed.value).toEqual(
      EntryPoint.Kind.Impl({
        relativePath: ImplModulePath.make(relativePath),
      }),
    );
  },
);

it.each(["tables/notes.impl.ts", "tables\\notes.impl.ts"])(
  "classifies %s as a table rather than an implementation",
  (relativePath) => {
    expect(EntryPoint.parse(relativePath)).toEqual(
      Option.some(
        EntryPoint.Kind.Table({
          relativePath: TableModulePath.make(relativePath),
        }),
      ),
    );
  },
);

it("keeps unrelated files out of the entry-point domain", () => {
  expect(EntryPoint.parse("helpers.ts")).toEqual(Option.none());
  expect(EntryPoint.parse("notes.impl.js")).toEqual(Option.none());
});

it.each(["notes.spec.ts", "groups/notes.spec.ts", "groups\\notes.spec.ts"])(
  "uses the same parsed spec path for entry and declaration %s",
  (relativePath) => {
    const entry = EntryPoint.Kind.Spec({
      relativePath: SpecModulePath.make(relativePath),
    });
    expect(EntryPoint.parse(relativePath)).toEqual(Option.some(entry));
    expect(Schema.decodeOption(EntryPoint.Declaration)(entry)).toEqual(
      Option.some(entry),
    );
  },
);

it.each([
  "tables/notes.ts",
  "tables\\nested\\notes.ts",
  "tables/notes.spec.ts",
])(
  "uses the same parsed table path for entry and declaration %s",
  (relativePath) => {
    const entry = EntryPoint.Kind.Table({
      relativePath: TableModulePath.make(relativePath),
    });
    expect(EntryPoint.parse(relativePath)).toEqual(Option.some(entry));
    expect(Schema.decodeOption(EntryPoint.Declaration)(entry)).toEqual(
      Option.some(entry),
    );
  },
);

it.each([
  ["Spec", ".spec.ts"],
  ["Spec", "groups/.spec.ts"],
  ["Spec", "../notes.spec.ts"],
  ["Spec", "/notes.spec.ts"],
  ["Spec", "groups//notes.spec.ts"],
  ["Table", "notes.ts"],
  ["Table", "tables/.ts"],
  ["Table", "tables/../notes.ts"],
  ["Table", "tables//notes.ts"],
  ["Table", "/tables/notes.ts"],
])(
  "rejects malformed %s declaration %s at both boundaries",
  (_tag, relativePath) => {
    expect(EntryPoint.parse(relativePath)).toEqual(Option.none());
    expect(
      Schema.decodeUnknownOption(EntryPoint.Declaration)({
        _tag,
        relativePath,
      }),
    ).toEqual(Option.none());
  },
);

it("shares declaration brands with entry-point kinds", () => {
  expectTypeOf<EntryPoint.Declaration>().toEqualTypeOf<
    Extract<EntryPoint.Kind, { readonly _tag: "Spec" | "Table" }>
  >();
});

it.effect.each([
  { name: "posix", pathLayer: NodePath.layerPosix, sep: "/" },
  { name: "win32", pathLayer: NodePath.layerWin32, sep: "\\" },
])("plans declarations immutably with $name paths", ({ pathLayer, sep }) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const spec = EntryPoint.Kind.Spec({
      relativePath: SpecModulePath.make(`groups${sep}notes.spec.ts`),
    });
    const table = EntryPoint.Kind.Table({
      relativePath: TableModulePath.make(`tables${sep}groups${sep}notes.ts`),
    });
    const anotherTable = EntryPoint.Kind.Table({
      relativePath: TableModulePath.make(`tables${sep}users.ts`),
    });
    const declarations = [spec, table, spec, anotherTable] as const;
    const impl = ImplModulePath.make(`groups${sep}notes.impl.ts`);
    const anotherImpl = ImplModulePath.make("other.impl.ts");
    const affectedImpls = [impl, anotherImpl, impl] as const;
    const planned = EntryPoint.planDeclarations(
      declarations,
      affectedImpls,
      path,
    );
    expect(planned.tables).toEqual([
      { relativePath: table.relativePath, tableName: "notes" },
      { relativePath: anotherTable.relativePath, tableName: "users" },
    ]);
    expect(planned.paths).toHaveLength(2);
    expect(planned.paths).toEqual(expect.arrayContaining([impl, anotherImpl]));
    expect(
      EntryPoint.planDeclarations(declarations, affectedImpls, path),
    ).toEqual(planned);
    expect(declarations).toEqual([spec, table, spec, anotherTable]);
    expect(affectedImpls).toEqual([impl, anotherImpl, impl]);
    expect(EntryPoint.planDeclarations([spec], [], path)).toEqual({
      tables: [],
      paths: [impl],
    });
    expect(EntryPoint.planDeclarations([table], [], path)).toEqual({
      tables: [{ relativePath: table.relativePath, tableName: "notes" }],
      paths: [],
    });
    expectTypeOf(planned.paths).toEqualTypeOf<ReadonlyArray<ImplModulePath>>();
  }).pipe(Effect.provide(pathLayer)),
);
