import { describe, expect, it } from "@effect/vitest";
import * as GroupSpec from "../src/GroupSpec";

describe("isGroupSpec", () => {
  it("checks whether a value is a function spec", () => {
    const groupSpec: unknown = GroupSpec.makeAt("notes");

    expect(GroupSpec.isGroupSpec(groupSpec)).toStrictEqual(true);
  });
});

describe("makeAt", () => {
  it("disallows invalid JS identifiers as function names", () => {
    expect(() => GroupSpec.makeAt("123")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "123". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.]`,
    );
  });

  it("disallows reserved keywords as function names", () => {
    expect(() => GroupSpec.makeAt("if")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "if". "if" is a reserved JavaScript identifier.]`,
    );
  });

  it("disallows reserved Convex file names as function names", () => {
    expect(() => GroupSpec.makeAt("schema")).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "schema". "schema" is a reserved Convex file name.]`,
    );
  });
});

describe("withName", () => {
  it("returns the input unchanged when the name already matches", () => {
    const group = GroupSpec.makeAt("notes");

    const renamed = GroupSpec.withName("notes", group);

    expect(renamed).toBe(group);
  });

  it("returns a fresh copy with the new name and does not mutate the input", () => {
    const group = GroupSpec.makeAt("notes");
    const originalName = group.name;

    const renamed = GroupSpec.withName("renamed", group);

    expect(renamed).not.toBe(group);
    expect(renamed.name).toBe("renamed");
    // Input is untouched — no in-place rename, no shared state.
    expect(group.name).toBe(originalName);
  });

  it("preserves functions and groups in the copy", () => {
    const child = GroupSpec.makeAt("child");
    const group = GroupSpec.makeAt("parent").addGroup(child);

    const renamed = GroupSpec.withName("renamed", group);

    expect(renamed.groups).toBe(group.groups);
    expect(renamed.functions).toBe(group.functions);
  });
});
