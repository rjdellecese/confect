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
});
