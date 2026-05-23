import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { BundleFailedError } from "../src/BuildError";
import { validateSchema } from "../src/confect/codegen";
import { ConfectDirectory } from "../src/ConfectDirectory";

const fixtureConfect = `${import.meta.dirname}/../../server/test/mock-backend/fixtures/confect`;

const CodegenLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    _tag: "@confect/cli/ConfectDirectory",
    get: Effect.succeed(fixtureConfect),
  }),
);

layer(CodegenLayer)("validateSchema", (it) => {
  it.effect("accepts the fixture schema", () => validateSchema);

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
        const result = yield* Effect.either(validateSchema);

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
          const result = yield* Effect.either(validateSchema);

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
