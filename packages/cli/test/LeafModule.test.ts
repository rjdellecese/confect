import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, expect, layer } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";
import type { CodegenError } from "../src/CodegenError";
import { ConfectDirectory } from "../src/ConfectDirectory";
import {
  groupPathFromRelativeModulePath,
  implPathForSpec,
  isLeafImplPath,
  isLeafSpecPath,
  specImportPathFromGenerated,
  specPathForImpl,
  toLeafModule,
  toNodeRegistryLeaf,
  validateImpl,
  validateSpec,
} from "../src/LeafModule";
import type { LeafModule } from "../src/LeafModule";

const fixtureConfect = `${import.meta.dirname}/../../server/test/mock-backend/fixtures/confect`;

const LeafModuleLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    _tag: "@confect/cli/ConfectDirectory",
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

layer(LeafModuleLayer)("LeafModule paths", (it) => {
  it.effect("groupPathFromRelativeModulePath maps nested spec files", () =>
    Effect.gen(function* () {
      expect(
        yield* groupPathFromRelativeModulePath("notesAndRandom/notes.spec.ts"),
      ).toEqual({
        pathSegments: ["notesAndRandom", "notes"],
        groupPathDot: "notesAndRandom.notes",
      });
    }),
  );

  it.effect("specPathForImpl maps impl paths to sibling spec paths", () =>
    Effect.gen(function* () {
      expect(yield* specPathForImpl("notesAndRandom/notes.impl.ts")).toBe(
        "notesAndRandom/notes.spec.ts",
      );
    }),
  );

  it.effect("implPathForSpec maps spec paths to sibling impl paths", () =>
    Effect.gen(function* () {
      expect(yield* implPathForSpec("notesAndRandom/notes.spec.ts")).toBe(
        "notesAndRandom/notes.impl.ts",
      );
    }),
  );

  it.effect(
    "specImportPathFromGenerated builds import paths for _generated",
    () =>
      Effect.gen(function* () {
        expect(
          yield* specImportPathFromGenerated("notesAndRandom/notes.spec.ts"),
        ).toBe("../notesAndRandom/notes.spec");
      }),
  );

  it.effect("toNodeRegistryLeaf remaps node leaves for nodeSpec assembly", () =>
    Effect.sync(() => {
      const leaf: LeafModule = {
        relativePath: "node/email.spec.ts",
        pathSegments: ["node", "email"],
        groupPathDot: "node.email",
        registryGroupPathDot: "email",
        exportName: "email",
        runtime: "Node",
        specImportPath: "../node/email.spec",
      };

      expect(toNodeRegistryLeaf(leaf)).toEqual({
        ...leaf,
        pathSegments: ["email"],
        groupPathDot: "email",
      });
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

layer(LeafModuleLayer)("validateSpec", (it) => {
  it.effect("accepts a valid leaf spec", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/notes.spec.ts");
      yield* validateSpec(leaf);
    }),
  );

  it.effect("accepts a valid node leaf spec", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("node/typedErrorsNode.spec.ts");
      yield* validateSpec(leaf);
    }),
  );

  it.effect("rejects a spec without a GroupSpec default export", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/_invalid.spec.ts");
      const result = yield* Effect.either(
        withTempFile(
          "groups/_invalid.spec.ts",
          "export default {};\n",
          validateSpec(leaf),
        ),
      );

      assert(Either.isLeft(result));
      expect(result.left._tag).toBe("SpecMissingDefaultGroupSpecError");
    }),
  );

  it.effect("rejects a spec with a syntax error", () =>
    Effect.gen(function* () {
      const leaf = yield* toLeafModule("groups/_brokenSyntax.spec.ts");
      const result = yield* Effect.either(
        withTempFile(
          "groups/_brokenSyntax.spec.ts",
          "export default GroupSpec.make(\n",
          validateSpec(leaf),
        ),
      );

      assert(Either.isLeft(result));
      assert(result.left._tag === "BundleFailedError");
      expect(result.left.errors.length).toBeGreaterThan(0);
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
      const result = yield* Effect.either(
        withTempLeaf(
          "_mismatch",
          // Imports `./notes.spec` instead of its sibling `./_mismatch.spec`.
          `import notes from "./notes.spec";
import { Layer } from "effect";
void notes;
export default Layer.empty;
`,
          validateImpl,
        ),
      );

      assert(Either.isLeft(result));
      expect(result.left._tag).toBe("ImplMissingSpecImportError");
    }),
  );

  it.effect("rejects impl without a layer default export", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        withTempLeaf(
          "_notLayer",
          `import notes from "./_notLayer.spec";
export default notes;
`,
          validateImpl,
        ),
      );

      assert(Either.isLeft(result));
      expect(result.left._tag).toBe("ImplMissingDefaultLayerError");
    }),
  );

  it.effect("rejects impl with a syntax error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        withTempLeaf(
          "_brokenSyntax",
          `import notes from "./_brokenSyntax.spec";
export default GroupImpl.make(
`,
          validateImpl,
        ),
      );

      assert(Either.isLeft(result));
      assert(result.left._tag === "BundleFailedError");
      expect(result.left.errors.length).toBeGreaterThan(0);
    }),
  );

  it.effect(
    "rejects impl whose default export is not piped through GroupImpl.finalize",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          withTempLeaf(
            "_unfinalized",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
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

        assert(Either.isLeft(result));
        expect(result.left._tag).toBe("ImplNotFinalizedError");
      }),
  );

  it.effect(
    "rejects impl that does not provide every function declared by its spec",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          withTempLeaf(
            "_incomplete",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
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

        assert(Either.isLeft(result));
        assert(result.left._tag === "ImplMissingFunctionsError");
        // The reported group path is the impl/spec leaf's own filesystem
        // location, which points at the file that is missing functions.
        expect(result.left.groupPath).toBe("groups._incomplete");
        expect([...result.left.missingFunctionNames].sort()).toEqual(
          ["delete_", "getFirst", "internalGetFirst", "list"].sort(),
        );
      }),
  );
});
