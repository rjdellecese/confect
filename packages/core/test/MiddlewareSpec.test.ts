import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type * as FunctionProvenance from "@confect/core/FunctionProvenance";
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

class RequireUser extends MiddlewareSpec.MiddlewareSpec<
  RequireUser,
  { provides: CurrentUser }
>()("RequireUser", {
  error: () => NotSignedIn,
  functionTypes: { query: true, mutation: true, action: true },
}) {}

class MutationOnly extends MiddlewareSpec.MiddlewareSpec<MutationOnly>()(
  "MutationOnly",
  { functionTypes: { query: false, mutation: true, action: false } },
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

describe("`middleware` lives on `Builder`, not `FunctionSpec`", () => {
  it("keeps the erased constraint type method-free", () => {
    expectTypeOf<
      "middleware" extends keyof FunctionSpec.AnyWithProps ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "middleware" extends keyof typeof mutation ? true : false
    >().toEqualTypeOf<true>();
  });

  it("keeps `Extract`-narrowed generics satisfying the erased bound", () => {
    // This mirrors what `Handler` does and is the reason the method is on
    // `Builder`: narrow a *generic* spec parameter with `Extract`, then hand
    // the result to a type that re-imposes the erased bound. Adding a
    // generic `middleware` method to `FunctionSpec` makes the narrowed
    // `Extract<F, …> & F` stop satisfying that bound, and this alias alone
    // fails to compile (as `Handler.ts` did, with six TS2344s).
    type NeedsErasedBound<
      F extends
        FunctionSpec.AnyWithPropsWithFunctionProvenance<FunctionProvenance.AnyConfect>,
    > = FunctionSpec.Returns<F>;

    type LikeHandler<F extends FunctionSpec.AnyWithProps> =
      F extends FunctionSpec.WithFunctionProvenance<
        F,
        FunctionProvenance.AnyConfect
      >
        ? NeedsErasedBound<F>
        : never;

    expectTypeOf<LikeHandler<typeof mutation>>().toEqualTypeOf<null>();
    expectTypeOf<LikeHandler<typeof query>>().toEqualTypeOf<string>();
  });

  it("still narrows a spec union by name and by function type", () => {
    type Union = typeof query | typeof mutation;

    expectTypeOf<FunctionSpec.WithName<Union, "setThing">>().toEqualTypeOf<
      typeof mutation
    >();
    expectTypeOf<FunctionSpec.WithFunctionType<Union, "query">>().toEqualTypeOf<
      typeof query
    >();
  });
});

describe("MiddlewareSpec", () => {
  it("stores the key and the declared function types", () => {
    expect(RequireUser.key).toBe("RequireUser");
    expect(RequireUser.functionTypes).toStrictEqual({
      query: true,
      mutation: true,
      action: true,
    });
  });

  it("stores a narrower declaration's function types", () => {
    expect(MutationOnly.functionTypes).toStrictEqual({
      query: false,
      mutation: true,
      action: false,
    });
  });

  it("installs the error schema lazily, observable via presence checks", () => {
    const errorBuilt = MutableRef.make(false);

    class Lazy extends MiddlewareSpec.MiddlewareSpec<Lazy>()("Lazy", {
      functionTypes: { query: true, mutation: true, action: true },
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

  it("extracts Provides, Error, and FunctionTypes at the type level", () => {
    expectTypeOf<
      MiddlewareSpec.Provides<typeof RequireUser>
    >().toEqualTypeOf<CurrentUser>();
    expectTypeOf<
      MiddlewareSpec.Error<typeof RequireUser>
    >().toEqualTypeOf<NotSignedIn>();
    expectTypeOf<MiddlewareSpec.Provides<typeof MutationOnly>>().toBeNever();
    expectTypeOf<MiddlewareSpec.Error<typeof MutationOnly>>().toBeNever();
    expectTypeOf<
      MiddlewareSpec.FunctionTypes<typeof MutationOnly>
    >().toEqualTypeOf<"mutation">();
    expectTypeOf<
      MiddlewareSpec.FunctionTypes<typeof RequireUser>
    >().toEqualTypeOf<"query" | "mutation" | "action">();
  });

  it("requires every function type flag to be specified", () => {
    class Unspecified extends MiddlewareSpec.MiddlewareSpec<Unspecified>()(
      "Unspecified",
      {
        // @ts-expect-error - every flag must be specified
        functionTypes: { query: true, action: false },
      },
    ) {}

    expect(Unspecified.key).toBe("Unspecified");
  });

  it("rejects an all-false declaration", () => {
    expect(() => {
      class NoTypes extends MiddlewareSpec.MiddlewareSpec<NoTypes>()(
        "NoTypes",
        {
          // @ts-expect-error - at least one flag must be true
          functionTypes: { query: false, mutation: false, action: false },
        },
      ) {}

      return NoTypes;
    }).toThrowError(
      'Middleware "NoTypes" must declare at least one function type',
    );
  });

  it("rejects a function type flag the type checker only knows as boolean", () => {
    const computed: boolean = Math.random() > 0.5;

    class Computed extends MiddlewareSpec.MiddlewareSpec<Computed>()(
      "Computed",
      {
        // @ts-expect-error - flags must be literal true or false
        functionTypes: { query: true, mutation: true, action: computed },
      },
    ) {}

    expect(Computed.key).toBe("Computed");
  });
});

describe("GroupSpec.middleware", () => {
  it("appends middleware in attachment order", () => {
    const group = GroupSpec.make()
      .middleware(RequireUser)
      .addFunction(mutation)
      .middleware(MutationOnly);

    expect(group.middlewareSpecs.map((m) => m.key)).toStrictEqual([
      "RequireUser",
      "MutationOnly",
    ]);
  });

  it("renders attachment diagnostics with the bare key, not the brand", () => {
    expectTypeOf<
      MiddlewareSpec.ValidateAttach<
        typeof RequireUser,
        never,
        typeof RequireUser
      >
    >().toEqualTypeOf<
      MiddlewareSpec.AttachmentError<'Middleware "RequireUser" is already attached to this group'>
    >();
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

    expectTypeOf<GroupSpec.MiddlewareSpecs<typeof group>>().toEqualTypeOf<
      typeof RequireUser | typeof MutationOnly
    >();
  });

  it("rejects attaching middleware whose functionTypes don't cover a declared function", () => {
    // @ts-expect-error — MutationOnly does not declare function type "query"
    GroupSpec.make().addFunction(query).middleware(MutationOnly);
  });

  it("rejects adding a function whose type an attached middleware doesn't declare", () => {
    // @ts-expect-error — MutationOnly does not declare function type "query"
    GroupSpec.make().middleware(MutationOnly).addFunction(query);
  });

  it("accepts functions covered by every attached middleware", () => {
    GroupSpec.make()
      .middleware(MutationOnly)
      .addFunction(mutation)
      .middleware(RequireUser);
  });
});

describe("requires", () => {
  class ProvideUser extends MiddlewareSpec.MiddlewareSpec<
    ProvideUser,
    { provides: CurrentUser }
  >()("ProvideUser", {
    functionTypes: { query: true, mutation: true, action: true },
  }) {}

  class NeedsUser extends MiddlewareSpec.MiddlewareSpec<
    NeedsUser,
    { requires: CurrentUser }
  >()("NeedsUser", {
    functionTypes: { query: true, mutation: true, action: true },
  }) {}

  it("extracts Requires at the type level", () => {
    expectTypeOf<
      MiddlewareSpec.Requires<typeof NeedsUser>
    >().toEqualTypeOf<CurrentUser>();
    expectTypeOf<MiddlewareSpec.Requires<typeof ProvideUser>>().toBeNever();
  });

  it("accepts a requiring middleware attached after its provider", () => {
    const group = GroupSpec.make()
      .middleware(ProvideUser)
      .middleware(NeedsUser)
      .addFunction(mutation);

    expectTypeOf<GroupSpec.MiddlewareSpecs<typeof group>>().toEqualTypeOf<
      typeof ProvideUser | typeof NeedsUser
    >();
  });

  it("rejects a requiring middleware attached before its provider", () => {
    GroupSpec.make()
      // @ts-expect-error — nothing attached earlier provides CurrentUser
      .middleware(NeedsUser)
      .middleware(ProvideUser);
  });

  it("validates whole-group satisfaction for function-level middleware", () => {
    const covered = mutation.middleware(NeedsUser);

    const satisfied = GroupSpec.make()
      .middleware(ProvideUser)
      .addFunction(covered);
    const unsatisfied = GroupSpec.make().addFunction(covered);

    expectTypeOf<
      MiddlewareSpec.ValidateImplRequires<
        GroupSpec.Functions<typeof satisfied>,
        GroupSpec.MiddlewareSpecs<typeof satisfied>
      >
    >().toEqualTypeOf<unknown>();
    expectTypeOf<
      MiddlewareSpec.ValidateImplRequires<
        GroupSpec.Functions<typeof unsatisfied>,
        GroupSpec.MiddlewareSpecs<typeof unsatisfied>
      >
    >().toEqualTypeOf<
      MiddlewareSpec.AttachmentError<`Function "setThing" has middleware requiring services that no middleware covering it provides`>
    >();
  });
});

describe("FunctionSpec.middleware", () => {
  it("appends middleware to the function in attachment order", () => {
    const covered = mutation.middleware(MutationOnly).middleware(RequireUser);

    expect(covered.middlewareSpecs.map((m) => m.key)).toStrictEqual([
      "MutationOnly",
      "RequireUser",
    ]);
    expectTypeOf<FunctionSpec.MiddlewareSpecs<typeof covered>>().toEqualTypeOf<
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

  it("rejects middleware whose functionTypes don't include the function's type", () => {
    expect(() =>
      // @ts-expect-error — MutationOnly does not declare function type "query"
      query.middleware(MutationOnly),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Middleware "MutationOnly" does not declare function type "query" of function "getThing"]`,
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

    expectTypeOf<GroupSpec.MiddlewareSpecs<typeof group>>().toEqualTypeOf<
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

    class Lazy extends MiddlewareSpec.MiddlewareSpec<Lazy>()("LazyForRef", {
      functionTypes: { query: true, mutation: true, action: true },
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
