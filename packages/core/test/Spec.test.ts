import * as Record from "effect/Record";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as Spec from "@confect/core/Spec";

describe("root groups", () => {
  it("preserves physical group names without forcing schemas or mutating inputs", () => {
    let evaluations = 0;
    const root = GroupSpec.make({ root: true }).addFunction(
      FunctionSpec.publicQuery({
        name: "greet",
        args: () => {
          evaluations++;
          return { name: Schema.String };
        },
        returns: () => {
          evaluations++;
          return Schema.String;
        },
        error: () => {
          evaluations++;
          return Schema.String;
        },
      }),
    );
    const record = { app: root };
    const spec = Spec.fromGroups(record);
    expect(Spec.groups(spec).app.name).toBe("app");
    expect(Spec.groups(spec).app.root).toBe(true);
    expect(Spec.groups(spec).app.functions).toBe(root.functions);
    expect(root.name).toBe("");
    expect(record.app).toBe(root);
    expect(evaluations).toBe(0);
  });

  it("rejects nested roots and multiple top-level roots at assembly", () => {
    const root = GroupSpec.make({ root: true });
    expect(() =>
      Spec.fromGroups({ app: root, other: GroupSpec.makeNode({ root: true }) }),
    ).toThrow("Only one root group");
    expect(() =>
      Spec.fromGroups({
        parent: GroupSpec.addGroupsAt(GroupSpec.make(), { nested: root }),
      }),
    ).toThrow('Root group "parent/nested" must be at the top level');
    expect(root.name).toBe("");
  });

  it("rejects flattened function and namespace collisions across visibility", () => {
    const root = GroupSpec.make({ root: true }).addFunction(
      FunctionSpec.internalQuery({ name: "notes", returns: () => Schema.Null }),
    );
    const notes = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({ name: "list", returns: () => Schema.Null }),
    );
    expect(() => Spec.fromGroups({ app: root, notes })).toThrow(
      'Root ref name "notes" collides',
    );
    expect(() =>
      Spec.fromGroups({ app: GroupSpec.addGroupsAt(root, { notes }) }),
    ).toThrow('Root ref name "notes" collides');
    expect(() =>
      Spec.fromGroups({
        app: GroupSpec.addGroupsAt(GroupSpec.make({ root: true }), { notes }),
        notes,
      }),
    ).toThrow('Root ref name "notes" collides');
    expect(root.groups).toEqual({});
    expect(notes.name).toBe("");
  });
});

describe("validateRootGroups", () => {
  it("returns tagged structured errors for invalid root placement", () => {
    expect(
      Spec.validateRootGroups([
        { path: ["parent", "app"], root: true, functionNames: [] },
      ]),
    ).toEqual(
      Result.fail(Spec.RootGroupsError.NestedRoot({ path: ["parent", "app"] })),
    );
    expect(
      Spec.validateRootGroups([
        { path: ["app"], root: true, functionNames: [] },
        { path: ["other"], root: true, functionNames: [] },
      ]),
    ).toEqual(
      Result.fail(
        Spec.RootGroupsError.MultipleRoots({ paths: [["app"], ["other"]] }),
      ),
    );
  });

  it("derives implicit namespaces from physical paths", () => {
    const entries = [
      { path: ["app"], root: true, functionNames: ["notes"] },
      { path: ["notes", "nested", "leaf"], functionNames: [] },
    ];
    expect(Spec.validateRootGroups(entries)).toEqual(
      Result.fail(
        Spec.RootGroupsError.RootNameCollision({
          name: "notes",
          paths: [["app"], ["notes"]],
        }),
      ),
    );
    expect(entries).toEqual([
      { path: ["app"], root: true, functionNames: ["notes"] },
      { path: ["notes", "nested", "leaf"], functionNames: [] },
    ]);
    expect(
      Spec.validateRootGroups([
        { path: ["app"], root: true, functionNames: [] },
        { path: ["app", "notes", "leaf"], functionNames: [] },
        { path: ["notes", "nested"], functionNames: [] },
      ]),
    ).toEqual(
      Result.fail(
        Spec.RootGroupsError.RootNameCollision({
          name: "notes",
          paths: [["app", "notes"], ["notes"]],
        }),
      ),
    );
  });

  it("allows unchanged layouts and sibling descendants of a root", () => {
    for (const entries of [
      [],
      [{ path: ["notes", "nested"], functionNames: ["get"] }],
      [
        { path: ["app"], root: true, functionNames: ["app", "greet"] },
        { path: ["app", "notes", "one"], functionNames: ["get"] },
        { path: ["app", "notes", "two"], functionNames: ["get"] },
        { path: ["other"], root: false, functionNames: ["greet"] },
      ],
    ]) {
      expect(Spec.validateRootGroups(entries)).toEqual(Result.void);
    }
  });
});

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
  expect(Record.keys(Spec.groups(before).notes.functions)).toEqual(["old"]);
  expect(Record.keys(Spec.groups(after).notes.functions)).toEqual(["current"]);
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
  expect(Record.keys(Spec.groups(after).service.functions)).toEqual([
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
  expect(Record.keys(groups)).toEqual(["databaseReader", "groups"]);
  expect(Record.keys(groups.groups.groups)).toEqual(["notes"]);
  expect(groups.groups.groups.notes.functions).toBe(notes.functions);
  expect(groups.databaseReader.name).toBe("databaseReader");
  expect(groups.groups.name).toBe("groups");
  expect(groups.groups.groups.notes.name).toBe("notes");
  expect(Record.keys(groups.databaseReader.functions)).toEqual(["listNotes"]);
  expect(Record.keys(groups.groups.groups.notes.functions)).toEqual(["list"]);
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

  expect(Record.keys(Spec.groups(spec)).sort()).toEqual(["email", "notes"]);

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
  expect(Record.has(groups, "__proto__")).toBe(true);
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
