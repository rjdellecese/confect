import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Ref from "@confect/core/Ref";
import * as Context from "effect/Context";
import * as MutableRef from "effect/MutableRef";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly name: string }
>()("@confect/core/test/MiddlewareSpec.test/CurrentUser") {}

class NotSignedIn extends Schema.TaggedError<NotSignedIn>()(
  "NotSignedIn",
  {},
) {}

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  id: Schema.String,
}) {}

class RequireUser extends MiddlewareSpec.Service<
  RequireUser,
  { provides: CurrentUser }
>()("RequireUser", {
  error: () => NotSignedIn,
}) {}

class MutationOnly extends MiddlewareSpec.Service<MutationOnly>()(
  "MutationOnly",
  { kinds: ["mutation"] },
) {}

const query = FunctionSpec.publicQuery({
  name: "getThing",
  args: () => Schema.Struct({}),
  returns: () => Schema.String,
});

const queryWithError = FunctionSpec.publicQuery({
  name: "getThingOrFail",
  args: () => Schema.Struct({}),
  returns: () => Schema.String,
  error: () => NotFound,
});

const mutation = FunctionSpec.publicMutation({
  name: "setThing",
  args: () => Schema.Struct({}),
  returns: () => Schema.Null,
});

describe("Service", () => {
  it("stores the key and defaults kinds to all three", () => {
    expect(RequireUser.key).toBe("RequireUser");
    expect(RequireUser.kinds).toStrictEqual(["query", "mutation", "action"]);
  });

  it("stores declared kinds", () => {
    expect(MutationOnly.kinds).toStrictEqual(["mutation"]);
  });

  it("installs the error schema lazily, observable via presence checks", () => {
    const errorBuilt = MutableRef.make(false);

    class Lazy extends MiddlewareSpec.Service<Lazy>()("Lazy", {
      error: () => {
        MutableRef.set(errorBuilt, true);
        return NotSignedIn;
      },
    }) {}

    expect("error" in Lazy).toBe(true);
    expect(MutableRef.get(errorBuilt)).toBe(false);

    expect(Lazy.error).toBe(NotSignedIn);
    expect(MutableRef.get(errorBuilt)).toBe(true);
  });

  it("omits the error key entirely when no error schema is declared", () => {
    expect("error" in MutationOnly).toBe(false);
  });

  it("extracts Provides, Error, and Kinds at the type level", () => {
    expectTypeOf<
      MiddlewareSpec.Provides<typeof RequireUser>
    >().toEqualTypeOf<CurrentUser>();
    expectTypeOf<
      MiddlewareSpec.Error<typeof RequireUser>
    >().toEqualTypeOf<NotSignedIn>();
    expectTypeOf<MiddlewareSpec.Provides<typeof MutationOnly>>().toBeNever();
    expectTypeOf<MiddlewareSpec.Error<typeof MutationOnly>>().toBeNever();
    expectTypeOf<
      MiddlewareSpec.Kinds<typeof MutationOnly>
    >().toEqualTypeOf<"mutation">();
    expectTypeOf<MiddlewareSpec.Kinds<typeof RequireUser>>().toEqualTypeOf<
      "query" | "mutation" | "action"
    >();
  });
});

describe("GroupSpec.middleware", () => {
  it("appends middleware in attachment order", () => {
    const group = GroupSpec.make()
      .middleware(RequireUser)
      .addFunction(mutation)
      .middleware(MutationOnly);

    expect(group.middlewares.map((m) => m.key)).toStrictEqual([
      "RequireUser",
      "MutationOnly",
    ]);
  });

  it("throws on duplicate attachment at runtime", () => {
    expect(() =>
      GroupSpec.make()
        .middleware(RequireUser)
        // @ts-expect-error — duplicate attachment is also a type error
        .middleware(RequireUser),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Middleware "RequireUser" is already attached to this group]`,
    );
  });

  it("extracts the attached middleware union at the type level", () => {
    const group = GroupSpec.make()
      .middleware(RequireUser)
      .addFunction(mutation)
      .middleware(MutationOnly);

    expectTypeOf<GroupSpec.Middlewares<typeof group>>().toEqualTypeOf<
      typeof RequireUser | typeof MutationOnly
    >();
  });

  it("rejects attaching middleware whose kinds don't cover a declared function", () => {
    // @ts-expect-error — MutationOnly does not declare kind "query"
    GroupSpec.make().addFunction(query).middleware(MutationOnly);
  });

  it("rejects adding a function whose kind an attached middleware doesn't declare", () => {
    // @ts-expect-error — MutationOnly does not declare kind "query"
    GroupSpec.make().middleware(MutationOnly).addFunction(query);
  });

  it("accepts functions covered by every attached middleware", () => {
    GroupSpec.make()
      .middleware(MutationOnly)
      .addFunction(mutation)
      .middleware(RequireUser);
  });
});

describe("FunctionSpec.middleware", () => {
  it("appends middleware to the function in attachment order", () => {
    const covered = mutation.middleware(MutationOnly).middleware(RequireUser);

    expect(covered.middlewares.map((m) => m.key)).toStrictEqual([
      "MutationOnly",
      "RequireUser",
    ]);
    expectTypeOf<FunctionSpec.Middlewares<typeof covered>>().toEqualTypeOf<
      typeof MutationOnly | typeof RequireUser
    >();
  });

  it("throws on duplicate attachment at runtime", () => {
    expect(() =>
      mutation
        .middleware(MutationOnly)
        // @ts-expect-error — duplicate attachment is also a type error
        .middleware(MutationOnly),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Middleware "MutationOnly" is already attached to function "setThing"]`,
    );
  });

  it("rejects middleware whose kinds don't include the function's kind", () => {
    expect(() =>
      // @ts-expect-error — MutationOnly does not declare kind "query"
      query.middleware(MutationOnly),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Middleware "MutationOnly" does not declare kind "query" of function "getThing"]`,
    );
  });

  it("rejects middleware on plain Convex functions", () => {
    const convexQuery = FunctionSpec.convexPublicQuery<any>()("plainQuery");

    expect(() =>
      // @ts-expect-error — plain Convex functions cannot have middleware
      convexQuery.middleware(RequireUser),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Plain Convex function "plainQuery" cannot have middleware]`,
    );
  });

  it("rejects attaching a group middleware already attached to a function", () => {
    const covered = mutation.middleware(MutationOnly);

    expect(() =>
      GroupSpec.make()
        .addFunction(covered)
        // @ts-expect-error — MutationOnly is already attached to setThing
        .middleware(MutationOnly),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Middleware "MutationOnly" is attached to both function "setThing" and its group]`,
    );
  });

  it("rejects adding a function carrying a group-attached middleware", () => {
    const covered = mutation.middleware(MutationOnly);

    expect(() =>
      GroupSpec.make()
        .middleware(MutationOnly)
        // @ts-expect-error — MutationOnly is already attached to the group
        .addFunction(covered),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Middleware "MutationOnly" is attached to both function "setThing" and its group]`,
    );
  });

  it("allows distinct middleware at group and function level", () => {
    const group = GroupSpec.make()
      .middleware(RequireUser)
      .addFunction(mutation.middleware(MutationOnly));

    expectTypeOf<GroupSpec.Middlewares<typeof group>>().toEqualTypeOf<
      typeof RequireUser
    >();
  });
});

describe("Ref error union", () => {
  it("decodes both the function's error and its middleware's error", () => {
    const ref = Ref.make("ns", queryWithError, [RequireUser]);

    const notFound = Ref.decodeErrorOption(ref, {
      _tag: "NotFound",
      id: "123",
    });
    expect(Option.isSome(notFound)).toBe(true);

    const notSignedIn = Ref.decodeErrorOption(ref, { _tag: "NotSignedIn" });
    expect(Option.isSome(notSignedIn)).toBe(true);

    const unknown = Ref.decodeErrorOption(ref, { _tag: "SomethingElse" });
    expect(Option.isNone(unknown)).toBe(true);
  });

  it("decodes a middleware error on a function with no error schema of its own", () => {
    const ref = Ref.make("ns", query, [RequireUser]);

    expect(Ref.hasErrorSchema(ref)).toBe(true);
    const notSignedIn = Ref.decodeErrorOption(ref, { _tag: "NotSignedIn" });
    expect(Option.isSome(notSignedIn)).toBe(true);
  });

  it("reports no error schema when neither function nor middleware declares one", () => {
    const ref = Ref.make("ns", query, [MutationOnly]);

    expect(Ref.hasErrorSchema(ref)).toBe(false);
  });

  it("hasErrorSchema checks middleware error presence without forcing the thunk", () => {
    const errorBuilt = MutableRef.make(false);

    class Lazy extends MiddlewareSpec.Service<Lazy>()("LazyForRef", {
      error: () => {
        MutableRef.set(errorBuilt, true);
        return NotSignedIn;
      },
    }) {}

    const ref = Ref.make("ns", query, [Lazy]);

    expect(Ref.hasErrorSchema(ref)).toBe(true);
    expect(MutableRef.get(errorBuilt)).toBe(false);
  });

  it("types the ref error as the union of function and middleware errors", () => {
    expectTypeOf<
      Ref.Error<Ref.FromFunctionSpec<typeof queryWithError, NotSignedIn>>
    >().toEqualTypeOf<NotFound | NotSignedIn>();
  });
});
