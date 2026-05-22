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
