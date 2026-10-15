import * as MiddlewareAttachment from "@confect/core/MiddlewareAttachment";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

describe("isGroupSpec", () => {
  it("checks whether a value is a function spec", () => {
    const groupSpec: unknown = GroupSpec.make();

    expect(GroupSpec.isGroupSpec(groupSpec)).toStrictEqual(true);
  });
});

describe("name validation", () => {
  it("disallows invalid JS identifiers as function names", () => {
    expect(() =>
      GroupSpec.withName("123", GroupSpec.make()),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "123". Valid identifiers must start with a letter, underscore, or dollar sign, and can only contain letters, numbers, underscores, or dollar signs.]`,
    );
  });

  it("disallows reserved keywords as function names", () => {
    expect(() =>
      GroupSpec.withName("if", GroupSpec.make()),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "if". "if" is a reserved JavaScript identifier.]`,
    );
  });

  it("disallows reserved Convex file names as function names", () => {
    expect(() =>
      GroupSpec.withName("schema", GroupSpec.make()),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Expected a valid Confect function identifier, but received: "schema". "schema" is a reserved Convex file name.]`,
    );
  });
});

describe("withName", () => {
  it("returns the input unchanged when the name already matches", () => {
    const group = GroupSpec.withName("notes", GroupSpec.make());

    const renamed = GroupSpec.withName("notes", group);

    expect(renamed).toBe(group);
  });

  it("returns a fresh copy with the new name and does not mutate the input", () => {
    const group = GroupSpec.withName("notes", GroupSpec.make());
    const originalName = group.name;

    const renamed = GroupSpec.withName("renamed", group);

    expect(renamed).not.toBe(group);
    expect(renamed.name).toBe("renamed");
    // Input is untouched—no in-place rename, no shared state.
    expect(group.name).toBe(originalName);
  });

  it("preserves functions and groups in the copy", () => {
    const child = GroupSpec.make();
    const group = GroupSpec.withName(
      "parent",
      GroupSpec.addGroupsAt(GroupSpec.make(), { child }),
    );

    const renamed = GroupSpec.withName("renamed", group);

    expect(renamed.groups).toBe(group.groups);
    expect(renamed.functions).toBe(group.functions);
  });
});

describe("addGroupsAt", () => {
  it("preserves the parent while replacing only matching children", () => {
    let evaluated = 0;
    const leaf = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "get",
        args: () => {
          evaluated++;
          return { id: Schema.String };
        },
        returns: () => {
          evaluated++;
          return Schema.String;
        },
        error: () => {
          evaluated++;
          return Schema.String;
        },
      }),
    );
    const node = GroupSpec.makeNode().addFunction(
      FunctionSpec.publicNodeAction({
        name: "send",
        returns: () => Schema.Null,
      }),
    );
    const parent = GroupSpec.withName(
      "parent",
      GroupSpec.addGroupsAt(leaf, { keep: leaf, replace: leaf }),
    );
    const input = { replace: node, extra: leaf };
    const assembled = GroupSpec.addGroupsAt(parent, input);

    expect(evaluated).toBe(0);
    expect(assembled).not.toBe(parent);
    expect(assembled.name).toBe("parent");
    expect(assembled.runtime).toBe("Convex");
    expect(assembled.functions).toBe(parent.functions);
    expect(assembled.middlewareAttachments).toBe(parent.middlewareAttachments);
    expect(assembled.groups.keep).toBe(parent.groups.keep);
    expect(assembled.groups.replace.runtime).toBe("Node");
    expect(assembled.groups.replace.name).toBe("replace");
    expect(parent.groups.replace.runtime).toBe("Convex");
    expect(Object.keys(parent.groups)).toEqual(["keep", "replace"]);
    expect(input).toEqual({ replace: node, extra: leaf });
    expect(leaf.name).toBe("");
    expect(node.name).toBe("");
    expect(Object.keys(assembled.functions)).toEqual(["get"]);
    expect(Object.keys(assembled.groups)).toEqual(["keep", "replace", "extra"]);
    expect(Object.keys(assembled.groups.replace.functions)).toEqual(["send"]);
  });

  it("accepts Convex children under Node parents and empty child records", () => {
    const parent = GroupSpec.makeNode();
    const child = GroupSpec.make();
    const assembled = GroupSpec.addGroupsAt(parent, {
      child,
    });
    const empty = GroupSpec.addGroupsAt(assembled, {});
    expect(assembled.runtime).toBe("Node");
    expect(assembled.groups.child.runtime).toBe("Convex");
    expect(empty.groups.child).toBe(assembled.groups.child);
    expect(parent.groups).toEqual({});
    expect(empty.functions).toBe(assembled.functions);
    expect(empty.middlewareAttachments).toBe(assembled.middlewareAttachments);
    expect(Object.keys(empty.groups)).toEqual(["child"]);
  });

  it("validates child names without modifying inputs on failure", () => {
    const parent = GroupSpec.make();
    const child = GroupSpec.make();
    for (const name of ["123", "if", "schema"]) {
      expect(() =>
        GroupSpec.addGroupsAt(parent, { valid: child, [name]: child }),
      ).toThrow("Expected a valid Confect function identifier");
    }
    expect(parent.groups).toEqual({});
    expect(child.name).toBe("");
  });

  it("preserves special property names as own child bindings", () => {
    const group = GroupSpec.addGroupsAt(GroupSpec.make(), {
      ["__proto__"]: GroupSpec.make(),
      constructor: GroupSpec.make(),
    });
    expect(Object.hasOwn(group.groups, "__proto__")).toBe(true);
    expect(group.groups.__proto__.name).toBe("__proto__");
    expect(group.groups.constructor.name).toBe("constructor");
    expect(Object.getPrototypeOf(group.groups)).toBe(Object.prototype);
  });

  it("checks group inputs without accumulating their types", () => {
    expectTypeOf(
      GroupSpec.addGroupsAt,
    ).returns.toEqualTypeOf<GroupSpec.AnyWithProps>();
    expectTypeOf<GroupSpec.Any>().not.toExtend<
      Parameters<typeof GroupSpec.addGroupsAt>[0]
    >();
    expectTypeOf<{ bad: number }>().not.toExtend<
      Parameters<typeof GroupSpec.addGroupsAt>[1]
    >();
    expectTypeOf<{ bad: GroupSpec.Any }>().not.toExtend<
      Parameters<typeof GroupSpec.addGroupsAt>[1]
    >();
  });
});

describe("AddGroups", () => {
  it("models replacement, renaming, mixed runtimes, and empty additions", () => {
    const get = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    });
    const send = FunctionSpec.publicNodeAction({
      name: "send",
      returns: () => Schema.Null,
    });
    type Leaf = GroupSpec.GroupSpec<"Convex", "", typeof get>;
    type Node = GroupSpec.GroupSpec<"Node", "", typeof send>;
    type Parent = GroupSpec.NamedAt<
      GroupSpec.GroupSpec<
        "Convex",
        "",
        typeof get,
        GroupSpec.NamedAt<Leaf, "keep"> | GroupSpec.NamedAt<Leaf, "replace">
      >,
      "parent"
    >;
    type Combined = GroupSpec.AddGroups<
      Parent,
      GroupSpec.NamedAt<Node, "replace"> | GroupSpec.NamedAt<Leaf, "extra">
    >;
    expectTypeOf<Combined["name"]>().toEqualTypeOf<"parent">();
    expectTypeOf<Combined["runtime"]>().toEqualTypeOf<"Convex">();
    expectTypeOf<GroupSpec.Functions<Combined>>().toEqualTypeOf<typeof get>();
    expectTypeOf<GroupSpec.GroupNames<Combined>>().toEqualTypeOf<
      "keep" | "replace" | "extra"
    >();
    expectTypeOf<Combined["groups"]["replace"]>().toEqualTypeOf<
      GroupSpec.NamedAt<Node, "replace">
    >();
    expectTypeOf<
      FunctionSpec.Name<GroupSpec.Functions<Combined["groups"]["replace"]>>
    >().toEqualTypeOf<"send">();
    expectTypeOf<Parent["groups"]["replace"]>().toEqualTypeOf<
      GroupSpec.NamedAt<Leaf, "replace">
    >();
    expectTypeOf<
      GroupSpec.AddGroups<Combined, never>
    >().toEqualTypeOf<Combined>();
    type NodeWithChild = GroupSpec.AddGroups<
      Node,
      GroupSpec.NamedAt<Leaf, "child">
    >;
    expectTypeOf<NodeWithChild["runtime"]>().toEqualTypeOf<"Node">();
    expectTypeOf<
      NodeWithChild["groups"]["child"]["runtime"]
    >().toEqualTypeOf<"Convex">();
  });
});

describe("middleware options", () => {
  class AccessDenied extends Schema.TaggedError<AccessDenied>()(
    "AccessDenied",
    {},
  ) {}

  class RequireRole extends MiddlewareSpec.MiddlewareSpec<RequireRole>()(
    "RequireRole",
    {
      options: () =>
        Schema.Struct({
          roles: Schema.Array(Schema.Literals(["Internal", "Buyer"])),
        }),
      error: () => AccessDenied,
      functionTypes: { query: true, mutation: true, action: true },
    },
  ) {}

  class Observe extends MiddlewareSpec.MiddlewareSpec<Observe>()("Observe", {
    functionTypes: { query: true, mutation: true, action: true },
  }) {}

  const query = FunctionSpec.publicQuery({
    name: "get",
    returns: () => Schema.String,
  });

  it("requires exactly the declared attachment options", () => {
    GroupSpec.make().middleware(RequireRole, { roles: ["Buyer"] });
    GroupSpec.make().middleware(Observe);
    // @ts-expect-error
    GroupSpec.make().middleware(RequireRole);
    // @ts-expect-error
    GroupSpec.make().middleware(RequireRole, { roles: ["Unknown"] });
    // @ts-expect-error
    GroupSpec.make().middleware(RequireRole, undefined);
    // @ts-expect-error
    GroupSpec.make().middleware(Observe, {});
  });

  it("accepts the options schema's type rather than its encoded input", () => {
    class Limit extends MiddlewareSpec.MiddlewareSpec<Limit>()("Limit", {
      options: () => Schema.Struct({ limit: Schema.FiniteFromString }),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const group = GroupSpec.make().middleware(Limit, { limit: 5 });
    expect(group.middlewareAttachments[0]?.options).toEqual({ limit: 5 });
    // @ts-expect-error
    GroupSpec.make().middleware(Limit, { limit: "5" });
  });

  it("preserves optionless members in mixed attachment types", () => {
    const mixed = GroupSpec.make()
      .middleware(Observe)
      .middleware(RequireRole, { roles: ["Internal"] });

    expectTypeOf<(typeof mixed.middlewareAttachments)[number]>().toEqualTypeOf<
      | MiddlewareAttachment.MiddlewareAttachment<typeof Observe>
      | MiddlewareAttachment.MiddlewareAttachment<typeof RequireRole>
    >();
    expectTypeOf<
      (typeof mixed.middlewareAttachments)[number]["options"]
    >().toEqualTypeOf<MiddlewareSpec.Options<typeof RequireRole> | undefined>();
    expect(mixed.middlewareAttachments.map(({ options }) => options)).toEqual([
      undefined,
      { roles: ["Internal"] },
    ]);
  });

  it("preserves attachments and derived specs through every group copy", () => {
    const group = GroupSpec.make()
      .middleware(RequireRole, { roles: ["Internal"] })
      .middleware(Observe);

    for (const copy of [
      group,
      group.addFunction(query),
      GroupSpec.addGroupsAt(group, { child: GroupSpec.make() }),
      GroupSpec.addGroupsAt(group, { alias: GroupSpec.make() }),
      GroupSpec.withName("renamed", group),
    ]) {
      expect(copy.middlewareAttachments).toBe(group.middlewareAttachments);
      expect(copy.middlewareSpecs).toEqual([RequireRole, Observe]);
      expect(Object.hasOwn(copy, "middlewareSpecs")).toBe(false);
    }
    expect(group.functions).toEqual({});
    expect(group.groups).toEqual({});
    expect(group.name).toBe("");
  });

  it("allows different options at both attachment levels and across their boundary", () => {
    const internal = query.middleware(RequireRole, { roles: ["Internal"] });
    const group = GroupSpec.make().middleware(RequireRole, {
      roles: ["Buyer"],
    });
    expect(
      GroupSpec.validateMiddleware(
        GroupSpec.make().addFunction(
          internal.middleware(RequireRole, { roles: ["Buyer"] }),
        ),
      ),
    ).toEqual(Result.succeed(undefined));
    expect(
      GroupSpec.validateMiddleware(
        group
          .middleware(RequireRole, { roles: ["Internal"] })
          .addFunction(query),
      ),
    ).toEqual(Result.succeed(undefined));
    expect(GroupSpec.validateMiddleware(group.addFunction(internal))).toEqual(
      Result.succeed(undefined),
    );
    expect(
      GroupSpec.validateMiddleware(
        GroupSpec.make()
          .addFunction(internal)
          .middleware(RequireRole, { roles: ["Buyer"] }),
      ),
    ).toEqual(Result.succeed(undefined));
  });

  it("rejects equivalent instances only during validation, including group/function overlaps", () => {
    const first = query.middleware(RequireRole, { roles: ["Internal"] });
    const second = first.middleware(RequireRole, { roles: ["Internal"] });
    const group = GroupSpec.make().middleware(RequireRole, {
      roles: ["Internal"],
    });
    for (const candidate of [
      GroupSpec.make().addFunction(second),
      group.middleware(RequireRole, { roles: ["Internal"] }),
      group.addFunction(first),
      GroupSpec.make()
        .addFunction(first)
        .middleware(RequireRole, { roles: ["Internal"] }),
    ]) {
      expect(GroupSpec.validateMiddleware(candidate)).toEqual(
        Result.fail(
          MiddlewareAttachment.ValidationError.EquivalentOptions({
            middlewareKey: "RequireRole",
            location:
              candidate.middlewareAttachments.length === 2
                ? 'group ""'
                : 'function "get"',
            previousIndex: 0,
            attachmentIndex: 1,
          }),
        ),
      );
    }
  });

  it("propagates child failures and stops before evaluating later children", () => {
    class Unreachable extends MiddlewareSpec.MiddlewareSpec<Unreachable>()(
      "Unreachable",
      {
        options: (): Schema.Schema<string> => {
          throw new Error("later child evaluated");
        },
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    const invalid = GroupSpec.make()
      .middleware(RequireRole, { roles: ["Internal"] })
      .middleware(RequireRole, { roles: ["Internal"] });
    const later = GroupSpec.make().middleware(Unreachable, "value");

    expect(
      GroupSpec.validateMiddleware(
        GroupSpec.addGroupsAt(GroupSpec.make(), { invalid, later }),
      ),
    ).toEqual(
      Result.fail(
        MiddlewareAttachment.ValidationError.EquivalentOptions({
          middlewareKey: "RequireRole",
          location: 'group "invalid"',
          previousIndex: 0,
          attachmentIndex: 1,
        }),
      ),
    );
  });
});
