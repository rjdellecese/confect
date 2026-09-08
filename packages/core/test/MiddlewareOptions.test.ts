import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
  FunctionSpec,
  GroupSpec,
  MiddlewareSpec,
  Ref,
  Refs,
  Spec,
} from "@confect/core";
import * as Schema from "effect/Schema";

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

describe("middleware attachment options", () => {
  it("requires exactly the declared options at both attachment levels", () => {
    query.middleware(RequireRole, { roles: ["Internal"] });
    GroupSpec.make().middleware(RequireRole, { roles: ["Buyer"] });
    query.middleware(Observe);
    GroupSpec.make().middleware(Observe);

    // @ts-expect-error
    query.middleware(RequireRole);
    // @ts-expect-error
    GroupSpec.make().middleware(RequireRole);
    // @ts-expect-error
    query.middleware(RequireRole, { roles: ["Unknown"] });
    // @ts-expect-error
    GroupSpec.make().middleware(RequireRole, { roles: ["Unknown"] });
    // @ts-expect-error
    query.middleware(RequireRole, {});
    // @ts-expect-error
    GroupSpec.make().middleware(RequireRole, undefined);
    // @ts-expect-error
    query.middleware(Observe, {});
    // @ts-expect-error
    GroupSpec.make().middleware(Observe, {});
  });

  it("keeps attachment values independent without mutating the spec or builder", () => {
    const internal = query.middleware(RequireRole, { roles: ["Internal"] });
    const buyer = query.middleware(RequireRole, { roles: ["Buyer"] });
    expect(internal.middlewareAttachments[0]?.options).toEqual({
      roles: ["Internal"],
    });
    expect(buyer.middlewareAttachments[0]?.options).toEqual({
      roles: ["Buyer"],
    });
    expect(query.middlewareAttachments).toEqual([]);
    expect(internal.middlewareSpecs).toEqual([RequireRole]);
    expectTypeOf<MiddlewareSpec.Options<typeof RequireRole>>().toEqualTypeOf<{
      readonly roles: ReadonlyArray<"Internal" | "Buyer">;
    }>();
  });

  it("preserves options through group builders and refs without inheriting into children", () => {
    const options = { roles: ["Internal"] as const };
    const group = GroupSpec.make()
      .middleware(RequireRole, options)
      .addFunction(query.middleware(Observe))
      .addGroup(GroupSpec.makeAt("child").addFunction(query))
      .addGroupAt("alias", GroupSpec.make().addFunction(query));
    const refs = Refs.make(Spec.make().addAt("roles", group));
    expect(refs.public.roles.get.middlewareAttachments[0]?.options).toBe(
      options,
    );
    expect(refs.public.roles.child.get.middlewareAttachments).toEqual([]);
    expect(refs.public.roles.alias.get.middlewareAttachments).toEqual([]);
    expectTypeOf<
      Ref.Error<typeof refs.public.roles.get>
    >().toEqualTypeOf<AccessDenied>();
    expectTypeOf<Ref.Error<typeof refs.public.roles.child.get>>().toBeNever();

    const functionRefs = Refs.make(
      Spec.make().addAt(
        "roles",
        GroupSpec.make().addFunction(query.middleware(RequireRole, options)),
      ),
    );
    expect(
      functionRefs.public.roles.get.middlewareAttachments[0]?.options,
    ).toBe(options);
    expectTypeOf<
      Ref.Error<typeof functionRefs.public.roles.get>
    >().toEqualTypeOf<AccessDenied>();
  });

  it("allows different options at both attachment levels and across their boundary", () => {
    const internal = query.middleware(RequireRole, { roles: ["Internal"] });
    const group = GroupSpec.make().middleware(RequireRole, {
      roles: ["Buyer"],
    });
    GroupSpec.validateMiddleware(
      GroupSpec.make().addFunction(
        internal.middleware(RequireRole, { roles: ["Buyer"] }),
      ),
    );
    GroupSpec.validateMiddleware(
      group.middleware(RequireRole, { roles: ["Internal"] }).addFunction(query),
    );
    GroupSpec.validateMiddleware(group.addFunction(internal));
    GroupSpec.validateMiddleware(
      GroupSpec.make()
        .addFunction(internal)
        .middleware(RequireRole, { roles: ["Buyer"] }),
    );
  });

  it("retains client-safe resolver values without serializing them", () => {
    class Resource extends MiddlewareSpec.MiddlewareSpec<Resource>()(
      "Resource",
      {
        options: () =>
          Schema.Struct({
            resolve: Schema.declare<(args: unknown) => string>(
              (value): value is (args: unknown) => string =>
                typeof value === "function",
            ),
            tolerateMissing: Schema.Boolean,
          }),
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    const resolve = (_args: unknown) => "resource-id";
    const options = { resolve, tolerateMissing: true };
    const ref = Ref.make("resources", query.middleware(Resource, options));
    expect(ref.middlewareAttachments[0]?.options).toBe(options);
    expectTypeOf<Ref.Error<typeof ref>>().toBeNever();
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
      expect(() => GroupSpec.validateMiddleware(candidate)).toThrowError(
        /RequireRole.*equivalent options.*1 and 2/,
      );
    }
  });

  it("keeps options schemas lazy through construction, assembly, and refs", () => {
    let evaluations = 0;
    class LazyPolicy extends MiddlewareSpec.MiddlewareSpec<LazyPolicy>()(
      "LazyPolicy",
      {
        options: () => {
          evaluations++;
          return Schema.Struct({ enabled: Schema.Boolean });
        },
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    const group = GroupSpec.make()
      .middleware(LazyPolicy, { enabled: true })
      .addFunction(query.middleware(LazyPolicy, { enabled: false }));
    const refs = Refs.make(Spec.make().addAt("lazy", group));
    expect(
      refs.public.lazy.get.middlewareAttachments.map(({ options }) => options),
    ).toEqual([{ enabled: true }, { enabled: false }]);
    expect(evaluations).toBe(0);
    GroupSpec.validateMiddleware(group);
    expect(evaluations).toBe(1);
    GroupSpec.validateMiddleware(group);
    expect(evaluations).toBe(1);
  });

  it("uses schema equivalence overrides rather than serialized or reference equality", () => {
    class RoleSet extends MiddlewareSpec.MiddlewareSpec<RoleSet>()("RoleSet", {
      options: () =>
        Schema.Struct({ roles: Schema.Array(Schema.String) }).pipe(
          Schema.overrideToEquivalence(
            () => (left, right) =>
              left.roles.every((role) => right.roles.includes(role)) &&
              right.roles.every((role) => left.roles.includes(role)),
          ),
        ),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const group = GroupSpec.make()
      .middleware(RoleSet, { roles: ["Internal", "Buyer"] })
      .addFunction(
        query.middleware(RoleSet, { roles: ["Buyer", "Internal", "Buyer"] }),
      );
    expect(() => GroupSpec.validateMiddleware(group)).toThrowError(
      /equivalent options/,
    );
    GroupSpec.validateMiddleware(
      GroupSpec.make().addFunction(
        query
          .middleware(RequireRole, { roles: ["Internal", "Buyer"] })
          .middleware(RequireRole, { roles: ["Buyer", "Internal"] }),
      ),
    );
  });

  it("validates option values on the schema's type side", () => {
    class Limit extends MiddlewareSpec.MiddlewareSpec<Limit>()("Limit", {
      options: () => Schema.Struct({ limit: Schema.FiniteFromString }),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    GroupSpec.validateMiddleware(
      GroupSpec.make().middleware(Limit, { limit: 5 }),
    );
    expect(() => {
      // @ts-expect-error
      const group = GroupSpec.make().middleware(Limit, { limit: "5" });
      GroupSpec.validateMiddleware(group);
    }).toThrowError(/invalid options/);
  });

  it("rejects different spec declarations sharing an implementation key", () => {
    class OtherRole extends MiddlewareSpec.MiddlewareSpec<OtherRole>()(
      "RequireRole",
      {
        options: () => Schema.Struct({ roles: Schema.Array(Schema.String) }),
        functionTypes: { query: true, mutation: true, action: true },
      },
    ) {}
    const group = GroupSpec.make()
      .middleware(RequireRole, { roles: ["Internal"] })
      .addFunction(query.middleware(OtherRole, { roles: ["Buyer"] }));
    expect(() => GroupSpec.validateMiddleware(group)).toThrowError(
      /Different middleware specs share key "RequireRole"/,
    );
  });
});
