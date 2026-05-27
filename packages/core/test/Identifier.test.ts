import { describe, expect, it } from "@effect/vitest";
import * as Identifier from "../src/Identifier";

describe("validateConfectFunctionIdentifier", () => {
  it.each([
    ["notes"],
    ["notes_v2"],
    ["notesV2"],
    ["_internal"],
    ["$secret"],
    ["NotesV2"],
  ])("accepts %s", (identifier) => {
    expect(() =>
      Identifier.validateConfectFunctionIdentifier(identifier),
    ).not.toThrow();
  });

  it.each([["123notes"], ["user-profiles"], ["with-dash"], [""]])(
    "rejects %s as not matching the JS identifier pattern",
    (identifier) => {
      expect(() =>
        Identifier.validateConfectFunctionIdentifier(identifier),
      ).toThrow(/Valid identifiers/);
    },
  );

  it.each([["import"], ["class"], ["return"], ["await"]])(
    "rejects %s as a reserved JS identifier",
    (identifier) => {
      expect(() =>
        Identifier.validateConfectFunctionIdentifier(identifier),
      ).toThrow(/reserved JavaScript identifier/);
    },
  );

  it.each([["schema"], ["http"], ["crons"]])(
    "rejects %s as a reserved Convex file name",
    (identifier) => {
      expect(() =>
        Identifier.validateConfectFunctionIdentifier(identifier),
      ).toThrow(/reserved Convex file name/);
    },
  );
});

describe("validateConfectTableIdentifier", () => {
  it.each([
    ["notes"],
    ["notes_v2"],
    ["notesV2"],
    ["users"],
    ["AccountBalances"],
  ])("accepts %s", (identifier) => {
    expect(() =>
      Identifier.validateConfectTableIdentifier(identifier),
    ).not.toThrow();
  });

  it.each([
    ["_internal"],
    ["_scheduled_functions"],
    ["123notes"],
    ["user-profiles"],
    ["$secret"],
    [""],
  ])(
    "rejects %s as not matching the table identifier pattern",
    (identifier) => {
      expect(() =>
        Identifier.validateConfectTableIdentifier(identifier),
      ).toThrow(/Valid table identifiers/);
    },
  );

  it.each([["import"], ["class"], ["return"], ["await"]])(
    "rejects %s as a reserved JS identifier",
    (identifier) => {
      expect(() =>
        Identifier.validateConfectTableIdentifier(identifier),
      ).toThrow(/reserved JavaScript identifier/);
    },
  );

  it("does NOT reject reserved Convex file names (those are orthogonal to table naming)", () => {
    expect(() =>
      Identifier.validateConfectTableIdentifier("schema"),
    ).not.toThrow();
    expect(() =>
      Identifier.validateConfectTableIdentifier("http"),
    ).not.toThrow();
    expect(() =>
      Identifier.validateConfectTableIdentifier("crons"),
    ).not.toThrow();
  });
});
