import { GroupSpec, Spec } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { resolveGroupPathUnsafe } from "../src/GroupPath";

describe("resolveGroupPathUnsafe", () => {
  it("finds nested group path by object identity", () => {
    const notes = GroupSpec.make();
    const notesAndRandom = GroupSpec.makeAt("notesAndRandom").addGroupAt(
      "notes",
      notes,
    );
    const spec = Spec.make().addAt("notesAndRandom", notesAndRandom);

    expect(resolveGroupPathUnsafe(spec, notes)).toBe("notesAndRandom.notes");
  });
});
