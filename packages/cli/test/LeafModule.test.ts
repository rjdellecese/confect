import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as String from "effect/String";
import * as Layer from "effect/Layer";
import type { CodegenError } from "@confect/cli/CodegenError";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import * as Bundler from "@confect/cli/Bundler";
import {
  discoverLeafImplFiles,
  discoverLeafSpecFiles,
  groupPathFromRelativeModulePath,
  implPathForSpec,
  isLeafImplPath,
  isLeafSpecPath,
  specImportPathFromGenerated,
  specPathForImpl,
  toLeafModule,
  validateImpl,
  validateSpec,
  type LeafModule,
} from "@confect/cli/LeafModule";

const fixtureConfect = `${import.meta.dirname}/../../server/test/mock-backend/fixtures/confect`;

const LeafModuleLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    get: Effect.succeed(fixtureConfect),
  }),
);

interface TempFile {
  readonly relativePath: string;
  readonly contents: string;
}

const withTempFiles = <A>(
  files: ReadonlyArray<TempFile>,
  use: Effect.Effect<
    A,
    CodegenError,
    ConfectDirectory | Path.Path | FileSystem.FileSystem
  >,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(files, ({ relativePath, contents }) =>
      fs.writeFileString(path.join(fixtureConfect, relativePath), contents),
    );
    return yield* use;
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* Effect.forEach(files, ({ relativePath }) =>
          Effect.gen(function* () {
            const absolutePath = path.join(fixtureConfect, relativePath);
            if (yield* fs.exists(absolutePath)) {
              yield* fs.remove(absolutePath);
            }
          }),
        );
      }).pipe(Effect.orDie),
    ),
  );

const withTempFile = <A>(
  relativePath: string,
  contents: string,
  use: Effect.Effect<
    A,
    CodegenError,
    ConfectDirectory | Path.Path | FileSystem.FileSystem
  >,
) => withTempFiles([{ relativePath, contents }], use);

/**
 * Materializes a temporary `groups/<stem>.spec.ts` + `groups/<stem>.impl.ts`
 * pair and yields the {@link LeafModule} for the spec to `use`. The spec
 * re-exports `./notes.spec`'s GroupSpec by default so impl contents that
 * reference `notes` continue to typecheck against the real notes GroupSpec.
 */
const withTempLeaf = (
  stem: string,
  implContents: string,
  use: (
    leaf: LeafModule,
  ) => Effect.Effect<
    void,
    CodegenError,
    ConfectDirectory | Path.Path | FileSystem.FileSystem
  >,
  specContents = `export { default } from "./notes.spec";\n`,
) =>
  Effect.gen(function* () {
    const leaf = yield* toLeafModule(`groups/${stem}.spec.ts`);
    yield* withTempFiles(
      [
        { relativePath: `groups/${stem}.spec.ts`, contents: specContents },
        { relativePath: `groups/${stem}.impl.ts`, contents: implContents },
      ],
      use(leaf),
    );
  });

const PLATFORMS = [
  { name: "posix", pathLayer: NodePath.layerPosix, sep: "/" },
  { name: "win32", pathLayer: NodePath.layerWin32, sep: "\\" },
] as const;

for (const { name, pathLayer, sep } of PLATFORMS) {
  const p = (...segments: ReadonlyArray<string>) => Array.join(segments, sep);

  layer(pathLayer)(`LeafModule paths, discovered as ${name}`, (it) => {
    it.effect("groupPathFromRelativeModulePath maps nested spec files", () =>
      Effect.gen(function* () {
        expect(
          yield* groupPathFromRelativeModulePath(
            p("notesAndRandom", "notes.spec.ts"),
          ),
        ).toEqual({
          pathSegments: ["notesAndRandom", "notes"],
          groupPathDot: "notesAndRandom.notes",
        });
      }),
    );

    it.effect(
      "specPathForImpl maps impl paths to sibling spec paths, keeping the platform separator",
      () =>
        Effect.gen(function* () {
          expect(
            yield* specPathForImpl(p("notesAndRandom", "notes.impl.ts")),
          ).toBe(p("notesAndRandom", "notes.spec.ts"));
        }),
    );

    it.effect(
      "implPathForSpec maps spec paths to sibling impl paths, keeping the platform separator",
      () =>
        Effect.gen(function* () {
          expect(
            yield* implPathForSpec(p("notesAndRandom", "notes.spec.ts")),
          ).toBe(p("notesAndRandom", "notes.impl.ts"));
        }),
    );

    it.effect(
      "specImportPathFromGenerated builds a POSIX specifier, not a filesystem path",
      () =>
        Effect.gen(function* () {
          expect(
            yield* specImportPathFromGenerated(
              p("notesAndRandom", "notes.spec.ts"),
            ),
          ).toBe("../notesAndRandom/notes.spec");
        }),
    );

    it.effect(
      "isLeafSpecPath and isLeafImplPath detect leaf module suffixes",
      () =>
        Effect.sync(() => {
          expect(isLeafSpecPath("notes.spec.ts")).toBe(true);
          expect(isLeafSpecPath("notes.impl.ts")).toBe(false);
          expect(isLeafImplPath("notes.impl.ts")).toBe(true);
          expect(isLeafImplPath("notes.spec.ts")).toBe(false);
        }),
    );
  });
}

layer(LeafModuleLayer)("validateSpec", (it) => {
  it.effect("accepts a valid leaf spec", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/notes.spec.ts");
      yield* validateSpec(leaf);
    }),
  );

  // A `makeNode()` spec validates regardless of its location — runtime is
  // declared by the spec, not the directory (no `confect/node/` requirement).
  it.effect("accepts a valid node leaf spec at a non-`node/` path", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("typedErrorsNode.spec.ts");
      const groupSpec = yield* validateSpec(leaf);
      expect(groupSpec.runtime).toBe("Node");
    }),
  );

  it.effect("rejects a spec without a GroupSpec default export", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/_invalid.spec.ts");
      const result = yield* Effect.result(
        withTempFile(
          "groups/_invalid.spec.ts",
          "export default {};\n",
          validateSpec(leaf),
        ),
      );

      assert(Result.isFailure(result));
      expect(result.failure._tag).toBe("SpecMissingDefaultGroupSpecError");
    }),
  );

  it.effect("rejects a spec with a syntax error", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/_brokenSyntax.spec.ts");
      const result = yield* Effect.result(
        withTempFile(
          "groups/_brokenSyntax.spec.ts",
          "export default GroupSpec.make(\n",
          validateSpec(leaf),
        ),
      );

      assert(Result.isFailure(result));
      assert(result.failure._tag === "BundleFailedError");
      expect(result.failure.errors.length).toBeGreaterThan(0);
    }),
  );

  // `groups/notes.spec.ts` uses `notes.Doc` from the generated table wrapper,
  // which binds `confect/tables/notes.ts`. Both must stay free of
  // `@confect/server` so the spec (and thus `_generated/refs.ts`) can ship
  // to the client.
  it.effect(
    "accepts a spec that uses `notes.Doc` from `_generated/tables/`",
    () =>
      Effect.gen(function* () {
        const leaf = yield* toLeafModule("groups/notes.spec.ts");
        yield* validateSpec(leaf);
      }),
  );

  it.effect(
    "rejects a spec that reaches `@confect/server` through `tables/`",
    () =>
      Effect.gen(function* () {
        const leaf = yield* toLeafModule("groups/_leakyTable.spec.ts");
        const result = yield* Effect.result(
          withTempFiles(
            [
              {
                relativePath: "tables/_leaky.ts",
                contents: `import { Table } from "@confect/server";\nexport default Table.make(() => {\n  throw new Error("unreachable");\n});\n`,
              },
              {
                relativePath: "_generated/tables/_leaky.ts",
                contents: `import unnamed from "../../tables/_leaky";\nexport default unnamed("_leaky");\n`,
              },
              {
                relativePath: "groups/_leakyTable.spec.ts",
                contents: `import { FunctionSpec, GroupSpec } from "@confect/core";\nimport * as Schema from "effect/Schema";\nimport leaky from "../_generated/tables/_leaky";\nexport default GroupSpec.make().addFunction(FunctionSpec.publicQuery({ name: "get", args: () => ({}), returns: () => leaky.Doc }));\n`,
              },
            ],
            validateSpec(leaf),
          ),
        );

        assert(Result.isFailure(result));
        assert(result.failure._tag === "SpecImportsServerError");
        expect(result.failure.specPath).toBe("groups/_leakyTable.spec.ts");
        expect(result.failure.importerPaths).toStrictEqual([
          "tables/_leaky.ts",
        ]);
      }),
  );

  it.effect("rejects a spec that value-imports `@confect/server`", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/_leaky.spec.ts");
      const result = yield* Effect.result(
        withTempFile(
          "groups/_leaky.spec.ts",
          `import { MiddlewareImpl } from "@confect/server";\nexport { default } from "./notes.spec";\nexport const leaked = MiddlewareImpl;\n`,
          validateSpec(leaf),
        ),
      );

      assert(Result.isFailure(result));
      assert(result.failure._tag === "SpecImportsServerError");
      expect(result.failure.importerPaths).toStrictEqual([
        "groups/_leaky.spec.ts",
      ]);
    }),
  );

  // The case the reserved `middleware/` directory creates: codegen never
  // validates those modules as leaves, so the only thing that catches a
  // middleware implementation co-located with its declaration is walking the
  // group spec's transitive imports.
  it.effect(
    "rejects a spec reaching a `middleware/` module that value-imports `@confect/server`",
    () =>
      Effect.gen(function* () {
        const leaf = yield* toLeafModule("groups/_leakyViaMiddleware.spec.ts");
        const result = yield* Effect.result(
          withTempFiles(
            [
              {
                relativePath: "middleware/_Leaky.spec.ts",
                contents: `import { MiddlewareImpl } from "@confect/server";\nexport const leaked = MiddlewareImpl;\n`,
              },
              {
                relativePath: "groups/_leakyViaMiddleware.spec.ts",
                contents: `import { leaked } from "../middleware/_Leaky.spec";\nexport { default } from "./notes.spec";\nexport const used = leaked;\n`,
              },
            ],
            validateSpec(leaf),
          ),
        );

        assert(Result.isFailure(result));
        assert(result.failure._tag === "SpecImportsServerError");
        expect(result.failure.specPath).toBe(
          "groups/_leakyViaMiddleware.spec.ts",
        );
        expect(result.failure.importerPaths).toStrictEqual([
          "middleware/_Leaky.spec.ts",
        ]);
      }),
  );

  // esbuild erases `import type` before it produces the metafile, so type-only
  // imports of server modules cost the client nothing and stay legal.
  it.effect("accepts a spec whose `@confect/server` import is type-only", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/_typeOnly.spec.ts");
      yield* withTempFile(
        "groups/_typeOnly.spec.ts",
        `import type * as MiddlewareImpl from "@confect/server/MiddlewareImpl";\nexport { default } from "./notes.spec";\nexport type Make = typeof MiddlewareImpl.make;\n`,
        validateSpec(leaf),
      );
    }),
  );
});

layer(LeafModuleLayer)("refs import graph", (it) => {
  it.effect(
    "does not value-import `@confect/server` through generated tables",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const refsPath = path.join(fixtureConfect, "_generated", "refs.ts");
        const bundled = yield* Bundler.bundle(refsPath);
        expect(
          Bundler.importersOfPackage(bundled, "@confect/server", () => true),
        ).toStrictEqual([]);
      }),
  );
});

// Discovery returns paths joined with the host separator, so these compare by
// path segment rather than against POSIX literals — a substring check for
// "middleware/" is vacuously true on Windows and asserts nothing there.
layer(LeafModuleLayer)("discovery", (it) => {
  it.effect("excludes `middleware/` from leaf spec discovery", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const specFiles = yield* discoverLeafSpecFiles;

      // The fixtures do have middleware specs there — they must not be
      // discovered as groups.
      expect(
        Array.filter(specFiles, (file) =>
          Array.contains(String.split(file, path.sep), "middleware"),
        ),
      ).toStrictEqual([]);
      // A group whose *name* starts with "middleware" is still discovered.
      expect(specFiles).toContain(
        Array.join(["groups", "middleware.spec.ts"], path.sep),
      );
    }),
  );

  it.effect("excludes `middleware/` from leaf impl discovery", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const implFiles = yield* discoverLeafImplFiles;

      expect(
        Array.filter(implFiles, (file) =>
          Array.contains(String.split(file, path.sep), "middleware"),
        ),
      ).toStrictEqual([]);
      expect(implFiles).toContain(
        Array.join(["groups", "middleware.impl.ts"], path.sep),
      );
    }),
  );
});

layer(LeafModuleLayer)("validateImpl", (it) => {
  it.effect("accepts a valid leaf impl paired with its spec", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/notes.spec.ts");
      yield* validateImpl(leaf);
    }),
  );

  it.effect("accepts a leaf impl that imports a CJS package", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/cjsImporter.spec.ts");
      yield* validateImpl(leaf);
    }),
  );

  it.effect("rejects impl that does not directly import the sibling spec", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        withTempLeaf(
          "_mismatch",
          // Imports `./notes.spec` instead of its sibling `./_mismatch.spec`.
          `import notes from "./notes.spec";
import * as Layer from "effect/Layer";
void notes;
export default Layer.empty;
`,
          validateImpl,
        ),
      );

      assert(Result.isFailure(result));
      expect(result.failure._tag).toBe("ImplMissingSpecImportError");
    }),
  );

  it.effect("rejects impl without a layer default export", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        withTempLeaf(
          "_notLayer",
          `import notes from "./_notLayer.spec";
export default notes;
`,
          validateImpl,
        ),
      );

      assert(Result.isFailure(result));
      expect(result.failure._tag).toBe("ImplMissingDefaultLayerError");
    }),
  );

  it.effect("rejects impl with a syntax error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        withTempLeaf(
          "_brokenSyntax",
          `import notes from "./_brokenSyntax.spec";
export default GroupImpl.make(
`,
          validateImpl,
        ),
      );

      assert(Result.isFailure(result));
      assert(result.failure._tag === "BundleFailedError");
      expect(result.failure.errors.length).toBeGreaterThan(0);
    }),
  );

  it.effect(
    "rejects impl whose default export is not piped through GroupImpl.finalize",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          withTempLeaf(
            "_unfinalized",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import notes from "./_unfinalized.spec";

const insert = FunctionImpl.make(databaseSchema, notes, "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("notes").insert({ text });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(databaseSchema, notes, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const delete_ = FunctionImpl.make(databaseSchema, notes, "delete_", ({ noteId }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    yield* writer.table("notes").delete(noteId);
    return null;
  }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(databaseSchema, notes, "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const internalGetFirst = FunctionImpl.make(databaseSchema, notes, "internalGetFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, notes).pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(internalGetFirst),
);
`,
            validateImpl,
          ),
        );

        assert(Result.isFailure(result));
        expect(result.failure._tag).toBe("ImplNotFinalizedError");
      }),
  );

  it.effect(
    "rejects impl that does not provide every function declared by its spec",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          withTempLeaf(
            "_incomplete",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { DatabaseWriter } from "../_generated/services";
import notes from "./_incomplete.spec";

const insert = FunctionImpl.make(databaseSchema, notes, "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("notes").insert({ text });
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, notes).pipe(
  Layer.provide(insert),
  // Cast away the remaining FunctionImpl requirements so the file
  // compiles even though only "insert" is implemented; the CLI must
  // still catch this at runtime.
  (layer) => layer as unknown as Layer.Layer<unknown, never, never>,
  GroupImpl.finalize as unknown as (
    layer: Layer.Layer<unknown, never, never>,
  ) => Layer.Layer<unknown, never, never>,
);
`,
            validateImpl,
          ),
        );

        assert(Result.isFailure(result));
        assert(result.failure._tag === "ImplMissingFunctionsError");
        // The reported group path is the impl/spec leaf's own filesystem
        // location, which points at the file that is missing functions.
        expect(result.failure.groupPath).toBe("groups._incomplete");
        expect([...result.failure.missingFunctionNames].sort()).toEqual(
          ["delete_", "getFirst", "internalGetFirst", "list"].sort(),
        );
      }),
  );
});
