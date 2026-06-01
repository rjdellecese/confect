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
      args: () => FnArgs,
      returns: () => FnReturns,
    }),
  );

  const databaseReader = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "listNotes",
      args: () => FnArgs,
      returns: () => FnReturns,
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

describe("merge", () => {
  it("merges a node spec's groups under a 'node' namespace", () => {
    const convexNotes = GroupSpec.make();
    const nodeEmail = GroupSpec.makeNode();

    const convexSpec = Spec.make().addAt("notes", convexNotes);
    const nodeSpec = Spec.makeNode().addAt("email", nodeEmail);

    const merged = Spec.merge(convexSpec, nodeSpec);

    expect(Object.keys(merged.groups).sort()).toEqual(["node", "notes"]);
    expect(
      Object.keys(
        (merged.groups as Record<string, GroupSpec.AnyWithProps>).node!.groups,
      ),
    ).toEqual(["email"]);
  });

  it("without a node spec preserves Convex groups verbatim", () => {
    const notes = GroupSpec.make();
    const convexSpec = Spec.make().addAt("notes", notes);

    const merged = Spec.merge(convexSpec);

    expect(Object.keys(merged.groups)).toEqual(["notes"]);
  });
});
