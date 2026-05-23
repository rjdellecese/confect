import { describe, expect, it } from "@effect/vitest";
import { GroupSpec, Spec } from "@confect/core";
import { resolveGroupPathOrDie } from "../src/GroupPath";

describe("resolveGroupPathOrDie", () => {
  it("finds nested group path by object identity", () => {
    const notes = GroupSpec.make();
    const notesAndRandom = GroupSpec.makeAt("notesAndRandom").addGroupAt(
      "notes",
      notes,
    );
    const spec = Spec.make().addAt("notesAndRandom", notesAndRandom);

    expect(resolveGroupPathOrDie(spec, notes)).toBe("notesAndRandom.notes");
  });
});
