import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "../src/FunctionSpec";
import * as GroupSpec from "../src/GroupSpec";
import type * as RefMod from "../src/Ref";
import * as Refs from "../src/Refs";
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

it("places a Node group alongside Convex groups, with no `node` namespace", () => {
  const FnArgs = Schema.Struct({});
  const FnReturns = Schema.Null;

  const notes = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => FnArgs,
      returns: () => Schema.Array(Schema.String),
    }),
  );

  // A Node action group built with `makeNode()` is added at the top level just
  // like any Convex group — there is no synthetic `node` namespace.
  const email = GroupSpec.makeNode().addFunction(
    FunctionSpec.publicNodeAction({
      name: "send",
      args: () => FnArgs,
      returns: () => FnReturns,
    }),
  );

  const spec = Spec.make().addAt("notes", notes).addAt("email", email);

  expect(Object.keys(spec.groups).sort()).toEqual(["email", "notes"]);

  const refs = Refs.make(spec);

  // The Node action is reachable at the top level (`refs.public.email.send`),
  // not under `refs.public.node.email.send`.
  expect("node" in refs.public).toBe(false);

  type PublicRefs = Refs.Refs<typeof spec, RefMod.AnyPublic>;
  expectTypeOf<keyof PublicRefs>().toEqualTypeOf<"notes" | "email">();
  expectTypeOf<PublicRefs["email"]["send"]>().toMatchTypeOf<RefMod.AnyAction>();
});
