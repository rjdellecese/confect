import * as MiddlewareAttachment from "@confect/core/MiddlewareAttachment";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

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
    const invalid = GroupSpec.makeAt("invalid")
      .middleware(RequireRole, { roles: ["Internal"] })
      .middleware(RequireRole, { roles: ["Internal"] });
    const later = GroupSpec.makeAt("later").middleware(Unreachable, "value");

    expect(
      GroupSpec.validateMiddleware(
        GroupSpec.make().addGroup(invalid).addGroup(later),
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
