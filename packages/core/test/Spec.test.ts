import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Schema } from "effect";
import * as FunctionSpec from "../src/FunctionSpec";
import * as GroupSpec from "../src/GroupSpec";
import type * as Refs from "../src/Refs";
import * as Spec from "../src/Spec";

describe("isSpec", () => {
  it("checks whether a value is a spec", () => {
    const spec: unknown = Spec.make();

    expect(Spec.isSpec(spec)).toStrictEqual(true);
  });
});

it("infers refs from addAt-assembled spec", () => {
  const FnArgs = Schema.Struct({});
  const FnReturns = Schema.Array(Schema.String);

  const notes = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: FnArgs,
      returns: FnReturns,
    }),
  );

  const databaseReader = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "listNotes",
      args: FnArgs,
      returns: FnReturns,
    }),
  );

  const _spec = Spec.make()
    .addAt("databaseReader", databaseReader)
    .addAt("groups", GroupSpec.makeAt("groups").addGroupAt("notes", notes));

  type SpecGroups = Spec.Groups<typeof _spec>;
  type TopLevelNames = GroupSpec.Name<SpecGroups>;
  type PublicRefs = Refs.Refs<typeof _spec>;

  expectTypeOf<TopLevelNames>().toEqualTypeOf<"databaseReader" | "groups">();
  expectTypeOf<keyof PublicRefs>().toEqualTypeOf<"databaseReader" | "groups">();
  expectTypeOf<PublicRefs["groups"]["notes"]["list"]>().not.toBeNever();
});

describe("paths", () => {
  it("start empty for a fresh Spec.make()", () => {
    const spec = Spec.make();

    expect(spec.paths.size).toBe(0);
  });

  it("addPath registers a single (group, path) entry", () => {
    const notes = GroupSpec.make();
    const spec = Spec.make().addPath(notes, "notes");

    expect(spec.paths.get(notes)).toBe("notes");
    expect(spec.paths.size).toBe(1);
  });

  it("chained addPath calls preserve every entry", () => {
    const notes = GroupSpec.make();
    const random = GroupSpec.make();
    const spec = Spec.make()
      .addPath(notes, "notesAndRandom.notes")
      .addPath(random, "notesAndRandom.random");

    expect(spec.paths.get(notes)).toBe("notesAndRandom.notes");
    expect(spec.paths.get(random)).toBe("notesAndRandom.random");
    expect(spec.paths.size).toBe(2);
  });

  it("addPath does not mutate the receiver", () => {
    const notes = GroupSpec.make();
    const base = Spec.make();
    const next = base.addPath(notes, "notes");

    expect(base.paths.size).toBe(0);
    expect(next.paths.size).toBe(1);
    expect(base).not.toBe(next);
  });

  it("re-registering the same group with the same path is a no-op", () => {
    const notes = GroupSpec.make();
    const spec = Spec.make().addPath(notes, "notes").addPath(notes, "notes");

    expect(spec.paths.size).toBe(1);
    expect(spec.paths.get(notes)).toBe("notes");
  });

  it("re-registering the same group with a different path throws", () => {
    const notes = GroupSpec.make();
    const spec = Spec.make().addPath(notes, "notes");

    expect(() => spec.addPath(notes, "other")).toThrowError(
      /already registered at "notes"/,
    );
  });

  it("rejects empty paths", () => {
    const notes = GroupSpec.make();

    expect(() => Spec.make().addPath(notes, "")).toThrowError(
      /non-empty Confect group path/,
    );
  });

  it("rejects paths with empty segments", () => {
    const notes = GroupSpec.make();

    expect(() => Spec.make().addPath(notes, "a..b")).toThrowError(
      /dot-separated identifier segments/,
    );
  });

  it("rejects paths whose segments are not valid identifiers", () => {
    const notes = GroupSpec.make();

    expect(() => Spec.make().addPath(notes, "1.b")).toThrowError(
      /valid Confect function identifier/,
    );
  });

  it("addAt preserves paths unchanged", () => {
    const notes = GroupSpec.make();
    const other = GroupSpec.make();
    const spec = Spec.make().addPath(notes, "notes").addAt("other", other);

    expect(spec.paths.get(notes)).toBe("notes");
    expect(spec.paths.size).toBe(1);
  });

  it("add preserves paths unchanged", () => {
    const notes = GroupSpec.make();
    const other = GroupSpec.makeAt("other");
    const spec = Spec.make().addPath(notes, "notes").add(other);

    expect(spec.paths.get(notes)).toBe("notes");
    expect(spec.paths.size).toBe(1);
  });

  it("merge unions Convex paths with Node paths re-prefixed by 'node.'", () => {
    const convexNotes = GroupSpec.make();
    const nodeNotes = GroupSpec.makeNode();

    const convexSpec = Spec.make().addPath(convexNotes, "notes");
    const nodeSpec = Spec.makeNode().addPath(nodeNotes, "nodeNotes");

    const merged = Spec.merge(convexSpec, nodeSpec);

    expect(merged.paths.get(convexNotes)).toBe("notes");
    expect(merged.paths.get(nodeNotes)).toBe("node.nodeNotes");
    expect(merged.paths.size).toBe(2);
  });

  it("merge without a node spec preserves Convex paths verbatim", () => {
    const notes = GroupSpec.make();
    const convexSpec = Spec.make().addPath(notes, "notes");

    const merged = Spec.merge(convexSpec);

    expect(merged.paths.get(notes)).toBe("notes");
    expect(merged.paths.size).toBe(1);
  });
});
