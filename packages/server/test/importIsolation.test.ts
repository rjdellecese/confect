import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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
    "group registry never imports an aggregate schema, api or spec at runtime",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;
        const registry = path.join(
          import.meta.dirname,
          "mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes.ts",
        );
        const contents = yield* fs.readFileString(registry);
        expect(contents).not.toMatch(
          /^import (?!type\b).* from "[^"]*\/(schema|convexSchema|api|nodeApi|spec)";$/m,
        );
        // The group's own leaf spec is referenced type-only, so it is erased
        // at transpile time (and the project-wide assembled spec is not used).
        expect(contents).toContain(
          'typeof import("../../../groups/notes.spec")["default"]',
        );
      }),
  );
});
