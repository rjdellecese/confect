import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import type * as RefMod from "@confect/core/Ref";
import * as Refs from "@confect/core/Refs";
import * as Spec from "@confect/core/Spec";

describe("isSpec", () => {
  it("checks whether a value is a spec", () => {
    const spec: unknown = Spec.fromGroups({});

    expect(Spec.isSpec(spec)).toStrictEqual(true);
  });
});

it("derives group types from the payload and replaces an existing group immutably", () => {
  const original = GroupSpec.withName(
    "notes",
    GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({ name: "old", returns: () => Schema.String }),
    ),
  );
  const replacement = GroupSpec.withName(
    "notes",
    GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "current",
        returns: () => Schema.Finite,
      }),
    ),
  );
  const empty = Spec.fromGroups({}) as Spec.Spec;
  const before = Spec.fromGroups({ notes: original }) as Spec.Spec<{
    notes: typeof original;
  }>;
  const after = Spec.fromGroups({
    ...Spec.groups(before),
    notes: replacement,
  }) as Spec.Spec<{
    notes: typeof replacement;
  }>;
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

it("replaces a bulk binding without changing the source group or forcing its schemas", () => {
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
  const input = { service: original };
  const before = Spec.fromGroups(input) as Spec.Spec<{
    service: GroupSpec.NamedAt<typeof original, "service">;
  }>;
  const after = Spec.fromGroups({
    ...Spec.groups(before),
    service: replacement,
  }) as Spec.Spec<{
    service: GroupSpec.NamedAt<typeof replacement, "service">;
  }>;
  expect(input.service).toBe(original);
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

it("derives refs from the declared bulk-assembled spec", () => {
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

  const _spec = Spec.fromGroups({
    databaseReader,
    groups: GroupSpec.addGroupsAt(GroupSpec.make(), { notes }),
  }) as Spec.Spec<{
    databaseReader: GroupSpec.NamedAt<typeof databaseReader, "databaseReader">;
    groups: GroupSpec.GroupSpec<
      "Convex",
      "groups",
      never,
      GroupSpec.NamedAt<typeof notes, "notes">
    >;
  }>;

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

  const spec = Spec.fromGroups({ notes, email }) as Spec.Spec<{
    notes: GroupSpec.NamedAt<typeof notes, "notes">;
    email: GroupSpec.NamedAt<typeof email, "email">;
  }>;

  expect(Object.keys(Spec.groups(spec)).sort()).toEqual(["email", "notes"]);

  const refs = Refs.make(spec);

  // The Node action is reachable at the group's own path
  // (`refs.public.email.send`), with no enclosing `node` group.
  expect("node" in refs.public).toBe(false);

  type PublicRefs = Refs.Refs<typeof spec, RefMod.AnyPublic>;
  expectTypeOf<keyof PublicRefs>().toEqualTypeOf<"notes" | "email">();
  expectTypeOf<PublicRefs["email"]["send"]>().toExtend<RefMod.AnyAction>();
});

it("validates every bulk binding name", () => {
  const group = GroupSpec.make();
  for (const name of ["123", "if", "schema"]) {
    expect(() => Spec.fromGroups({ [name]: group })).toThrow(
      "Expected a valid Confect function identifier",
    );
  }
  expect(group.name).toBe("");
});

it("preserves special property names as own group bindings", () => {
  const group = GroupSpec.make().addFunction(
    FunctionSpec.publicQuery({ name: "get", returns: () => Schema.String }),
  );
  const spec = Spec.fromGroups({ ["__proto__"]: group, constructor: group });
  const groups = Spec.groups(spec);
  expect(Object.hasOwn(groups, "__proto__")).toBe(true);
  expect(groups.__proto__.name).toBe("__proto__");
  expect(groups.constructor.name).toBe("constructor");
  expect(Object.getPrototypeOf(groups)).toBe(Object.prototype);
  expect(group.name).toBe("");
});

it("checks group inputs without accumulating their types", () => {
  expectTypeOf(Spec.fromGroups).returns.toEqualTypeOf<Spec.AnyWithProps>();
  expectTypeOf<{ bad: number }>().not.toExtend<
    Parameters<typeof Spec.fromGroups>[0]
  >();
  expectTypeOf<{ bad: GroupSpec.Any }>().not.toExtend<
    Parameters<typeof Spec.fromGroups>[0]
  >();
});
