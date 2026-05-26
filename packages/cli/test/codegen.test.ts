import { FunctionSpec, GroupSpec } from "@confect/core";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, expect, layer } from "@effect/vitest";
import { Effect, Either, Layer, Schema } from "effect";
import {
  validateNoParentChildNameCollisions,
  validateSchema,
} from "../src/confect/codegen";
import { ConfectDirectory } from "../src/ConfectDirectory";
import type { LeafModule } from "../src/LeafModule";

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

        assert(Either.isLeft(result));
        assert(result.left._tag === "BundleFailedError");
        expect(result.left.errors.length).toBeGreaterThan(0);
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

          assert(Either.isLeft(result));
          expect(result.left._tag).toBe("SchemaInvalidDefaultExportError");
        }).pipe(
          Effect.ensuring(
            fs.writeFileString(schemaPath, original).pipe(Effect.orDie),
          ),
        );
      }),
  );

  it.effect("rejects a missing schema file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped();

      const result = yield* validateSchema.pipe(
        Effect.either,
        Effect.provide(
          Layer.mock(ConfectDirectory, {
            _tag: "@confect/cli/ConfectDirectory",
            get: Effect.succeed(tempDir),
          }),
        ),
      );

      assert(Either.isLeft(result));
      expect(result.left._tag).toBe("MissingSchemaFileError");
    }).pipe(Effect.scoped),
  );
});

const leaf = (
  relativePath: string,
  pathSegments: [string, ...string[]],
): LeafModule => ({
  relativePath,
  pathSegments,
  groupPathDot: pathSegments.join("."),
  registryGroupPathDot: pathSegments.join("."),
  exportName: pathSegments[pathSegments.length - 1]!,
  runtime: "Convex",
  specImportPath: `../${relativePath.slice(0, -".ts".length)}`,
});

const emptyArgs = Schema.Struct({});
const emptyReturns = Schema.Null;

layer(Layer.empty)("validateNoParentChildNameCollisions", (it) => {
  it.effect("accepts non-colliding parent-with-children layouts", () =>
    Effect.gen(function* () {
      const parent = leaf("notes.spec.ts", ["notes"]);
      const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);
      const parentGroupSpec = GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: emptyArgs,
          returns: emptyReturns,
        }),
      );

      yield* validateNoParentChildNameCollisions(
        [parent, child],
        new Map([[parent.relativePath, parentGroupSpec]]),
      );
    }),
  );

  it.effect(
    "fails when a parent function name matches a sibling subdirectory segment",
    () =>
      Effect.gen(function* () {
        const parent = leaf("notes.spec.ts", ["notes"]);
        const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);
        const parentGroupSpec = GroupSpec.make().addFunction(
          FunctionSpec.publicQuery({
            name: "archived",
            args: emptyArgs,
            returns: emptyReturns,
          }),
        );

        const result = yield* Effect.either(
          validateNoParentChildNameCollisions(
            [parent, child],
            new Map([[parent.relativePath, parentGroupSpec]]),
          ),
        );

        assert(Either.isLeft(result));
        expect(result.left._tag).toBe("ParentChildNameCollisionError");
        expect(result.left.collisionKind).toBe("function");
        expect(result.left.collisionName).toBe("archived");
        expect(result.left.parentSpecPath).toBe("notes.spec.ts");
        expect(result.left.childSpecPath).toBe("notes/archived.spec.ts");
      }),
  );

  it.effect(
    "fails when a parent addGroupAt name matches a sibling subdirectory segment",
    () =>
      Effect.gen(function* () {
        const parent = leaf("notes.spec.ts", ["notes"]);
        const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);
        const inner = GroupSpec.makeAt("inner").addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            args: emptyArgs,
            returns: emptyReturns,
          }),
        );
        const parentGroupSpec = GroupSpec.make().addGroupAt("archived", inner);

        const result = yield* Effect.either(
          validateNoParentChildNameCollisions(
            [parent, child],
            new Map([[parent.relativePath, parentGroupSpec]]),
          ),
        );

        assert(Either.isLeft(result));
        expect(result.left._tag).toBe("ParentChildNameCollisionError");
        expect(result.left.collisionKind).toBe("group");
        expect(result.left.collisionName).toBe("archived");
      }),
  );

  it.effect("ignores collisions when there is no parent leaf", () =>
    Effect.gen(function* () {
      const child = leaf("notes/archived.spec.ts", ["notes", "archived"]);

      yield* validateNoParentChildNameCollisions([child], new Map());
    }),
  );
});
