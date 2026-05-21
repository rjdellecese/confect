import { Path } from "@effect/platform";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import {
  groupPathFromRelativeModulePath,
  implPathForSpec,
  isLeafImplPath,
  isLeafSpecPath,
  specImportPathFromGenerated,
  specPathForImpl,
  toNodeRegistryLeaf,
} from "../src/modulePaths";
import type { LeafModule } from "../src/modulePaths";

layer(Path.layer)("modulePaths", (it) => {
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

  it.effect("specImportPathFromGenerated builds import paths for _generated", () =>
    Effect.gen(function* () {
      expect(yield* specImportPathFromGenerated("notesAndRandom/notes.spec.ts")).toBe(
        "../notesAndRandom/notes.spec",
      );
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

  it.effect("isLeafSpecPath and isLeafImplPath detect leaf module suffixes", () =>
    Effect.sync(() => {
      expect(isLeafSpecPath("notes.spec.ts")).toBe(true);
      expect(isLeafSpecPath("notes.impl.ts")).toBe(false);
      expect(isLeafImplPath("notes.impl.ts")).toBe(true);
      expect(isLeafImplPath("notes.spec.ts")).toBe(false);
    }),
  );
});
