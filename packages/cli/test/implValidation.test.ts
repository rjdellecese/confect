import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { BundleFailedError } from "../src/BuildError";
import type { CodegenError } from "../src/CodegenError";
import { ConfectDirectory } from "../src/ConfectDirectory";
import {
  validateImplModule,
  validateSchemaModule,
  validateSpecModule,
} from "../src/implValidation";

const fixtureConfect = `${import.meta.dirname}/../../server/test/mock-backend/fixtures/confect`;

const ValidationLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    _tag: "@confect/cli/ConfectDirectory",
    get: Effect.succeed(fixtureConfect),
  }),
);

const withTempFile = (
  relativePath: string,
  contents: string,
  use: Effect.Effect<
    void,
    CodegenError,
    ConfectDirectory | Path.Path | FileSystem.FileSystem
  >,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolutePath = path.join(fixtureConfect, relativePath);
    yield* fs.writeFileString(absolutePath, contents);
    yield* use;
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const absolutePath = path.join(fixtureConfect, relativePath);
        if (yield* fs.exists(absolutePath)) {
          yield* fs.remove(absolutePath);
        }
      }).pipe(Effect.orDie),
    ),
  );

layer(ValidationLayer)("validateSpecModule", (it) => {
  it.effect("accepts a valid leaf spec", () =>
    validateSpecModule("groups/notes.spec.ts"),
  );

  it.effect("accepts a valid node leaf spec", () =>
    validateSpecModule("node/typedErrorsNode.spec.ts"),
  );

  it.effect("rejects a spec without a GroupSpec default export", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        withTempFile(
          "groups/_invalid.spec.ts",
          "export default {};\n",
          validateSpecModule("groups/_invalid.spec.ts"),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SpecMissingDefaultGroupSpecError");
      }
    }),
  );

  it.effect("rejects a spec with a syntax error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        withTempFile(
          "groups/_brokenSyntax.spec.ts",
          "export default GroupSpec.make(\n",
          validateSpecModule("groups/_brokenSyntax.spec.ts"),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("BundleFailedError");
        expect(
          (result.left as BundleFailedError).errors.length,
        ).toBeGreaterThan(0);
      }
    }),
  );
});

layer(ValidationLayer)("validateImplModule", (it) => {
  it.effect("accepts a valid leaf impl paired with its spec", () =>
    validateImplModule("groups/notes.impl.ts", "groups/notes.spec.ts"),
  );

  it.effect("rejects impl that does not directly import the sibling spec", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        validateImplModule("groups/random.impl.ts", "groups/notes.spec.ts"),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ImplMissingSpecImportError");
      }
    }),
  );

  it.effect("rejects impl without a layer default export", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        withTempFile(
          "groups/_invalid.impl.ts",
          `import notes from "./notes.spec";
export default notes;
`,
          validateImplModule("groups/_invalid.impl.ts", "groups/notes.spec.ts"),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ImplMissingDefaultLayerError");
      }
    }),
  );

  it.effect("rejects impl with a syntax error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        withTempFile(
          "groups/_brokenSyntax.impl.ts",
          `import notes from "./notes.spec";
export default GroupImpl.make(
`,
          validateImplModule(
            "groups/_brokenSyntax.impl.ts",
            "groups/notes.spec.ts",
          ),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("BundleFailedError");
        expect(
          (result.left as BundleFailedError).errors.length,
        ).toBeGreaterThan(0);
      }
    }),
  );

  it.effect(
    "rejects impl whose default export is not piped through GroupImpl.finalize",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          withTempFile(
            "groups/_unfinalized.impl.ts",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import notes from "./notes.spec";

const insert = FunctionImpl.make(api, notes, "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("notes").insert({ text });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(api, notes, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const delete_ = FunctionImpl.make(api, notes, "delete_", ({ noteId }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    yield* writer.table("notes").delete(noteId);
    return null;
  }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(api, notes, "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const internalGetFirst = FunctionImpl.make(api, notes, "internalGetFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(api, notes).pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(internalGetFirst),
);
`,
            validateImplModule(
              "groups/_unfinalized.impl.ts",
              "groups/notes.spec.ts",
            ),
          ),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("ImplNotFinalizedError");
        }
      }),
  );

  it.effect(
    "rejects impl that does not provide every function declared by its spec",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          withTempFile(
            "groups/_incomplete.impl.ts",
            `import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import { DatabaseWriter } from "../_generated/services";
import notes from "./notes.spec";

const insert = FunctionImpl.make(api, notes, "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("notes").insert({ text });
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(api, notes).pipe(
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
            validateImplModule(
              "groups/_incomplete.impl.ts",
              "groups/notes.spec.ts",
            ),
          ),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("ImplMissingFunctionsError");
          if (result.left._tag === "ImplMissingFunctionsError") {
            expect(result.left.groupPath).toBe("groups.notes");
            expect([...result.left.missingFunctionNames].sort()).toEqual(
              ["delete_", "getFirst", "internalGetFirst", "list"].sort(),
            );
          }
        }
      }),
  );
});

layer(ValidationLayer)("validateSchemaModule", (it) => {
  it.effect("accepts the fixture schema", () => validateSchemaModule());

  it.effect("rejects a schema with a syntax error", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const schemaPath = path.join(fixtureConfect, "schema.ts");
      const original = yield* fs.readFileString(schemaPath);

      yield* Effect.gen(function* () {
        yield* fs.writeFileString(
          schemaPath,
          "export default DatabaseSchema.make(\n",
        );
        const result = yield* Effect.either(validateSchemaModule());

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("BundleFailedError");
          expect(
            (result.left as BundleFailedError).errors.length,
          ).toBeGreaterThan(0);
        }
      }).pipe(
        Effect.ensuring(
          fs.writeFileString(schemaPath, original).pipe(Effect.orDie),
        ),
      );
    }),
  );

  it.effect(
    "rejects a schema whose default export is not a DatabaseSchema",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const schemaPath = path.join(fixtureConfect, "schema.ts");
        const original = yield* fs.readFileString(schemaPath);

        yield* Effect.gen(function* () {
          yield* fs.writeFileString(schemaPath, "export default {};\n");
          const result = yield* Effect.either(validateSchemaModule());

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left._tag).toBe("SchemaInvalidDefaultExportError");
          }
        }).pipe(
          Effect.ensuring(
            fs.writeFileString(schemaPath, original).pipe(Effect.orDie),
          ),
        );
      }),
  );
});
