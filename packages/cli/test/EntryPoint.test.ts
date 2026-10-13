import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import * as EntryPoint from "@confect/cli/EntryPoint";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import * as Option from "effect/Option";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as Path from "effect/Path";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";

it("refines optional entries without including spec, impl, table, or config entries", () => {
  const entries: Array<EntryPoint.Kind> = [
    EntryPoint.Kind.Http({ relativePath: "http.ts" }),
    EntryPoint.Kind.Crons({ relativePath: "crons.ts" }),
    EntryPoint.Kind.Auth({ relativePath: "auth.ts" }),
    EntryPoint.Kind.Spec({ relativePath: "notes.spec.ts" }),
    EntryPoint.Kind.Impl({
      relativePath: ImplModulePath.make("notes.impl.ts"),
    }),
    EntryPoint.Kind.Table({ relativePath: "tables/notes.ts" }),
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
      Option.some(EntryPoint.Kind.Table({ relativePath })),
    );
  },
);

it("keeps unrelated files out of the entry-point domain", () => {
  expect(EntryPoint.parse("helpers.ts")).toEqual(Option.none());
  expect(EntryPoint.parse("notes.impl.js")).toEqual(Option.none());
});
