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

class RequireRole extends MiddlewareSpec.MiddlewareSpec<
  RequireRole,
  {
    options: { readonly roles: ReadonlyArray<"Internal" | "Buyer"> };
  }
>()("RequireRole", {
  error: () => AccessDenied,
  functionTypes: { query: true, mutation: true, action: true },
}) {}

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
    expect(internal.middlewareOptions.RequireRole).toEqual({
      roles: ["Internal"],
    });
    expect(buyer.middlewareOptions.RequireRole).toEqual({ roles: ["Buyer"] });
    expect(query.middlewareOptions).toEqual({});
    expect(RequireRole).not.toHaveProperty("options");
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
    expect(refs.public.roles.get.middlewareOptions.RequireRole).toBe(options);
    expect(refs.public.roles.child.get.middlewareOptions).toEqual({});
    expect(refs.public.roles.alias.get.middlewareOptions).toEqual({});
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
    expect(functionRefs.public.roles.get.middlewareOptions.RequireRole).toBe(
      options,
    );
    expectTypeOf<
      Ref.Error<typeof functionRefs.public.roles.get>
    >().toEqualTypeOf<AccessDenied>();
  });

  it("rejects duplicate keys even when their options differ", () => {
    const internal = query.middleware(RequireRole, { roles: ["Internal"] });
    const group = GroupSpec.make().middleware(RequireRole, {
      roles: ["Buyer"],
    });
    expect(() => {
      // @ts-expect-error
      internal.middleware(RequireRole, { roles: ["Buyer"] });
    }).toThrowError(/already attached/);
    expect(() => {
      // @ts-expect-error
      group.middleware(RequireRole, { roles: ["Internal"] });
    }).toThrowError(/already attached/);
    expect(() => {
      // @ts-expect-error
      group.addFunction(internal);
    }).toThrowError(/both function/);
    expect(() => {
      const withFunction = GroupSpec.make().addFunction(internal);
      // @ts-expect-error
      withFunction.middleware(RequireRole, { roles: ["Buyer"] });
    }).toThrowError(/both function/);
  });

  it("retains client-safe resolver values without serializing them", () => {
    class Resource extends MiddlewareSpec.MiddlewareSpec<
      Resource,
      {
        options: {
          readonly resolve: (args: unknown) => string;
          readonly tolerateMissing: boolean;
        };
      }
    >()("Resource", {
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const resolve = (_args: unknown) => "resource-id";
    const options = { resolve, tolerateMissing: true };
    const ref = Ref.make("resources", query.middleware(Resource, options));
    expect(ref.middlewareOptions.Resource).toBe(options);
    expectTypeOf<Ref.Error<typeof ref>>().toBeNever();
  });
});
