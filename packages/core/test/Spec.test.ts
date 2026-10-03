import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import type * as RefMod from "@confect/core/Ref";
import * as Refs from "@confect/core/Refs";
import * as Spec from "@confect/core/Spec";

describe("isSpec", () => {
  it("checks whether a value is a spec", () => {
    const spec: unknown = Spec.make();

    expect(Spec.isSpec(spec)).toStrictEqual(true);
  });
});

it("derives group types from the payload and replaces an existing group immutably", () => {
  const original = GroupSpec.makeAt("notes").addFunction(
    FunctionSpec.publicQuery({ name: "old", returns: () => Schema.String }),
  );
  const replacement = GroupSpec.makeAt("notes").addFunction(
    FunctionSpec.publicQuery({ name: "current", returns: () => Schema.Finite }),
  );
  const empty = Spec.make();
  const before = empty.add(original);
  const after = before.add(replacement);
  expect(Spec.groups(empty)).toEqual({});
  expect(Spec.groups(before).notes).toBe(original);
  expect(Spec.groups(after).notes).toBe(replacement);
  expectTypeOf<Spec.Groups<typeof empty>>().toBeNever();
  expectTypeOf<Spec.Groups<typeof after>>().toEqualTypeOf<typeof replacement>();
  expectTypeOf(Spec.groups(after).notes).toEqualTypeOf<typeof replacement>();
  expectTypeOf<
    keyof Refs.Refs<typeof after>["notes"]
  >().toEqualTypeOf<"current">();
});

it("replaces an addAt binding without changing the source group or forcing its schemas", () => {
  let evaluated = 0;
  const original = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "old",
      returns: () => {
        evaluated++;
        return Schema.String;
      },
    }),
  );
  const replacement = GroupSpec.makeNode().addFunction(
    FunctionSpec.publicNodeAction({
      name: "current",
      returns: () => {
        evaluated++;
        return Schema.Finite;
      },
    }),
  );
  const before = Spec.make().addAt("service", original);
  const after = before.addAt("service", replacement);
  expect(evaluated).toBe(0);
  expect(original.name).toBe("");
  expect(replacement.name).toBe("");
  expect(Spec.groups(before).service.runtime).toBe("Convex");
  expect(Spec.groups(after).service.runtime).toBe("Node");
  expectTypeOf<Spec.Groups<typeof after>>().toEqualTypeOf<
    GroupSpec.NamedAt<typeof replacement, "service">
  >();
  expectTypeOf<
    keyof Refs.Refs<typeof after>["service"]
  >().toEqualTypeOf<"current">();
});

it("infers refs from addAt-assembled spec", () => {
  const FnReturns = Schema.Array(Schema.String);

  const notes = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => FnReturns,
    }),
  );

  const databaseReader = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "listNotes",
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

it("places a Node group alongside Convex groups, with no `node` namespace", () => {
  const FnReturns = Schema.Null;

  const notes = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Array(Schema.String),
    }),
  );

  // A Node action group built with `makeNode()` is added at the top level like
  // any Convex group; its runtime lives on the group, not in a `node` namespace.
  const email = GroupSpec.makeNode().addFunction(
    FunctionSpec.publicNodeAction({
      name: "send",
      returns: () => FnReturns,
    }),
  );

  const spec = Spec.make().addAt("notes", notes).addAt("email", email);

  expect(Object.keys(Spec.groups(spec)).sort()).toEqual(["email", "notes"]);

  const refs = Refs.make(spec);

  // The Node action is reachable at the group's own path
  // (`refs.public.email.send`), with no enclosing `node` group.
  expect("node" in refs.public).toBe(false);

  type PublicRefs = Refs.Refs<typeof spec, RefMod.AnyPublic>;
  expectTypeOf<keyof PublicRefs>().toEqualTypeOf<"notes" | "email">();
  expectTypeOf<PublicRefs["email"]["send"]>().toExtend<RefMod.AnyAction>();
});
