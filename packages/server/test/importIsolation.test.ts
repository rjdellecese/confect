import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

const TestLayer = Layer.mergeAll(NodePath.layer, NodeFileSystem.layer);

layer(TestLayer)("import isolation", (it) => {
  it.effect("group registry imports only its leaf impl", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const fixtureRoot = path.join(
        import.meta.dirname,
        "mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes.ts",
      );
      const contents = yield* fs.readFileString(fixtureRoot);
      expect(contents).toContain("groups/notes.impl");
      expect(contents).not.toContain("groups/random.impl");
      expect(contents).not.toContain("impl.ts");
    }),
  );

  it.effect(
    "group registry imports the runtime schema, never the api or spec module",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;
        const registry = path.join(
          import.meta.dirname,
          "mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes.ts",
        );
        const contents = yield* fs.readFileString(registry);
        // The DatabaseSchema value is imported (cheap: table schemas only).
        expect(contents).toContain('import databaseSchema from "../../schema"');
        // The project-wide api/spec modules must NOT be runtime-imported —
        // importing them is what drags every sibling spec into this one
        // function's bundle.
        expect(contents).not.toMatch(
          /^import .* from "[^"]*\/(api|nodeApi)";$/m,
        );
        expect(contents).not.toMatch(
          /^import .* from "[^"]*\/(spec|nodeSpec)";$/m,
        );
        // The spec is referenced type-only, so it is erased at transpile time.
        expect(contents).toContain('typeof import("../../spec")["default"]');
      }),
  );
});
