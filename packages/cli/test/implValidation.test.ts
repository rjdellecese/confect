import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { describe, expect, test } from "@effect/vitest";
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

const validationLayer = Layer.mergeAll(
  NodePath.layer,
  NodeFileSystem.layer,
  Layer.mock(ConfectDirectory, {
    _tag: "@confect/cli/ConfectDirectory",
    get: Effect.succeed(fixtureConfect),
  }),
);

const run = <A, E>(effect: Effect.Effect<A, E, ConfectDirectory | Path.Path | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(validationLayer), Effect.runPromise);

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

describe("validateSpecModule", () => {
  test("accepts a valid leaf spec", async () => {
    await run(validateSpecModule("groups/notes.spec.ts"));
  });

  test("accepts a valid node leaf spec", async () => {
    await run(validateSpecModule("node/typedErrorsNode.spec.ts"));
  });

  test("rejects a spec without a GroupSpec default export", async () => {
    const result = await run(
      Effect.either(
        withTempFile("groups/_invalid.spec.ts", "export default {};\n", validateSpecModule("groups/_invalid.spec.ts")),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ImplValidationError);
      expect(result.left.message).toContain("must default-export GroupSpec");
    }
  });
});

describe("validateImplModule", () => {
  test("accepts a valid leaf impl paired with its spec", async () => {
    await run(
      validateImplModule("groups/notes.impl.ts", "groups/notes.spec.ts"),
    );
  });

  test("rejects impl that does not directly import the sibling spec", async () => {
    const result = await run(
      Effect.either(
        validateImplModule("groups/random.impl.ts", "groups/notes.spec.ts"),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ImplValidationError);
      expect(result.left.message).toContain('must import sibling spec "groups/notes.spec.ts"');
    }
  });

  test("rejects impl without a layer default export", async () => {
    const result = await run(
      Effect.either(
        withTempFile(
          "groups/_invalid.impl.ts",
          `import notes from "./notes.spec";
export default notes;
`,
          validateImplModule("groups/_invalid.impl.ts", "groups/notes.spec.ts"),
        ),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(ImplValidationError);
      expect(result.left.message).toContain("must default-export a GroupImpl layer");
    }
  });
});
