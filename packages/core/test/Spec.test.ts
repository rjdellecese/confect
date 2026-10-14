import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as Spec from "@confect/core/Spec";

describe("isSpec", () => {
  it("checks whether a value is a spec", () => {
    const spec: unknown = Spec.fromGroups({});

    expect(Spec.isSpec(spec)).toStrictEqual(true);
  });
});

it("replaces an existing group without mutating earlier specs", () => {
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
  const empty = Spec.fromGroups({});
  const before = Spec.fromGroups({ notes: original });
  const after = Spec.fromGroups({
    ...Spec.groups(before),
    notes: replacement,
  });
  expect(Spec.groups(empty)).toEqual({});
  expect(Spec.groups(before).notes).toBe(original);
  expect(Spec.groups(after).notes).toBe(replacement);
  expect(Object.keys(Spec.groups(before).notes.functions)).toEqual(["old"]);
  expect(Object.keys(Spec.groups(after).notes.functions)).toEqual(["current"]);
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
  const before = Spec.fromGroups(input);
  const after = Spec.fromGroups({
    ...Spec.groups(before),
    service: replacement,
  });
  expect(input.service).toBe(original);
  expect(evaluated).toBe(0);
  expect(original.name).toBe("");
  expect(replacement.name).toBe("");
  expect(Spec.groups(before).service.runtime).toBe("Convex");
  expect(Spec.groups(after).service.runtime).toBe("Node");
  expect(Spec.groups(before).service.name).toBe("service");
  expect(Spec.groups(after).service.name).toBe("service");
  expect(Object.keys(Spec.groups(after).service.functions)).toEqual([
    "current",
  ]);
});

it("assembles root and nested groups at their bound paths", () => {
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

  const spec = Spec.fromGroups({
    databaseReader,
    groups: GroupSpec.addGroupsAt(GroupSpec.make(), { notes }),
  });
  const groups = Spec.groups(spec);
  expect(Object.keys(groups)).toEqual(["databaseReader", "groups"]);
  expect(Object.keys(groups.groups.groups)).toEqual(["notes"]);
  expect(groups.groups.groups.notes.functions).toBe(notes.functions);
  expect(groups.databaseReader.name).toBe("databaseReader");
  expect(groups.groups.name).toBe("groups");
  expect(groups.groups.groups.notes.name).toBe("notes");
  expect(Object.keys(groups.databaseReader.functions)).toEqual(["listNotes"]);
  expect(Object.keys(groups.groups.groups.notes.functions)).toEqual(["list"]);
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

  const spec = Spec.fromGroups({ notes, email });

  expect(Object.keys(Spec.groups(spec)).sort()).toEqual(["email", "notes"]);

  expect("node" in Spec.groups(spec)).toBe(false);
  expect(Spec.groups(spec).email.runtime).toBe("Node");
  expect(Spec.groups(spec).notes.runtime).toBe("Convex");
});

it("retains precise group payload types independently of assembly", () => {
  const notes = GroupSpec.withName(
    "notes",
    GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "current",
        returns: () => Schema.String,
      }),
    ),
  );
  const empty = { [Spec.TypeId]: {} } satisfies Spec.AnyWithProps;
  const spec = { [Spec.TypeId]: { notes } } satisfies Spec.AnyWithProps;
  expectTypeOf<Spec.Groups<typeof empty>>().toBeNever();
  expectTypeOf<Spec.Groups<Spec.Spec>>().toBeNever();
  expectTypeOf<Spec.Groups<typeof spec>>().toEqualTypeOf<typeof notes>();
  expectTypeOf<
    GroupSpec.Name<Spec.Groups<typeof spec>>
  >().toEqualTypeOf<"notes">();
  expectTypeOf(Spec.groups(spec).notes).toEqualTypeOf<typeof notes>();
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
