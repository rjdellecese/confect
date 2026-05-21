import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { ConfectDirectory } from "../src/ConfectDirectory";
import {
  ImplValidationError,
  validateImplModule,
  validateSpecModule,
} from "../src/implValidation";

const fixtureConfect = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../server/test/mock-backend/fixtures/confect",
);

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
  use: Effect.Effect<void, ImplValidationError, ConfectDirectory | Path.Path | FileSystem.FileSystem>,
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
        expect(result.left._tag).toBe("ImplValidationError");
        expect(result.left.message).toContain("must default-export GroupSpec");
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
        expect(result.left._tag).toBe("ImplValidationError");
        expect(result.left.message).toContain(
          'must import sibling spec "groups/notes.spec.ts"',
        );
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
        expect(result.left._tag).toBe("ImplValidationError");
        expect(result.left.message).toContain(
          "must default-export a GroupImpl layer",
        );
      }
    }),
  );
});
