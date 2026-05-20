import { Path } from "@effect/platform";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import {
  groupPathFromRelativeModulePath,
  specPathForImpl,
} from "../src/modulePaths";

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
});
