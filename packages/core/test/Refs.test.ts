import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Ref from "@confect/core/Ref";
import * as Refs from "@confect/core/Refs";
import type * as RuntimeAndFunctionType from "@confect/core/RuntimeAndFunctionType";
import * as Spec from "@confect/core/Spec";

describe("make", () => {
  it("turns a spec into refs", () => {
    const FnReturns = Schema.Array(Schema.String);
    const list = FunctionSpec.publicQuery({
      name: "list",
      returns: () => FnReturns,
    });

    const spec = Spec.make().add(GroupSpec.makeAt("notes").addFunction(list));
    const refs = Refs.make(spec);

    const actualRef = refs.public.notes.list;
    const expectedRef = Ref.make("notes", list);

    expect(Ref.getConvexFunctionName(actualRef)).toStrictEqual(
      Ref.getConvexFunctionName(expectedRef),
    );
    expect(actualRef).toStrictEqual(expectedRef);
    expectTypeOf(actualRef).toEqualTypeOf(expectedRef);
  });

  it("throws an error if a group and function have the same name", () => {
    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addGroup(GroupSpec.makeAt("list"))
        .addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            returns: () => Schema.Array(Schema.String),
          }),
        ),
    );
    expect(() => Refs.make(spec)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Group and function at same level have same name ('notes:list')]`,
    );
  });

  it("filters internal refs to only internal functions", () => {
    const FnReturns = Schema.String;

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addFunction(
          FunctionSpec.publicQuery({
            name: "publicList",
            returns: () => FnReturns,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalList",
            returns: () => FnReturns,
          }),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf(refs.internal.notes.internalList).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "internal",
        {},
        typeof FnReturns
      >
    >();

    // @ts-expect-error - publicList should be filtered out
    void refs.internal.notes.publicList;
  });

  it("filters out groups with no matching functions", () => {
    const FnReturns = Schema.String;

    const spec = Spec.make()
      .add(
        GroupSpec.makeAt("publicOnly").addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            returns: () => FnReturns,
          }),
        ),
      )
      .add(
        GroupSpec.makeAt("internalOnly").addFunction(
          FunctionSpec.internalQuery({
            name: "list",
            returns: () => FnReturns,
          }),
        ),
      );

    const refs = Refs.make(spec);

    expectTypeOf(refs.internal.internalOnly.list).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "internal",
        {},
        typeof FnReturns
      >
    >();

    // @ts-expect-error - publicOnly group should be filtered out entirely
    void refs.internal.publicOnly;
  });

  it("filters public refs to only public functions", () => {
    const FnReturns = Schema.String;

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addFunction(
          FunctionSpec.publicQuery({
            name: "publicList",
            returns: () => FnReturns,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalList",
            returns: () => FnReturns,
          }),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf(refs.public.notes.publicList).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        {},
        typeof FnReturns
      >
    >();

    // @ts-expect-error - internalList should be filtered out
    void refs.public.notes.internalList;
  });

  it("turns a plain Convex spec into refs", () => {
    type ListQueryArgs = { tag: string };
    type ListQueryReturns = string[];

    const listSpec =
      FunctionSpec.convexPublicQuery<
        RegisteredQuery<"public", ListQueryArgs, Promise<ListQueryReturns>>
      >()("list");

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes").addFunction(listSpec),
    );
    const refs = Refs.make(spec);

    const actualRef = refs.public.notes.list;
    const expectedRef = Ref.make("notes", listSpec);

    expect(Ref.getConvexFunctionName(actualRef)).toStrictEqual(
      Ref.getConvexFunctionName(expectedRef),
    );
    expect(actualRef).toStrictEqual(expectedRef);
    expectTypeOf(actualRef).toEqualTypeOf(expectedRef);

    expectTypeOf(actualRef).toEqualTypeOf<
      Ref.ConvexRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        ListQueryArgs,
        ListQueryReturns
      >
    >();
  });

  it("filters plain Convex refs by visibility", () => {
    type GetQueryArgs = { id: string };
    type GetQueryReturns = string;

    type RemoveMutationArgs = { id: string };
    type RemoveMutationReturns = void;

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addFunction(
          FunctionSpec.convexPublicQuery<
            RegisteredQuery<"public", GetQueryArgs, Promise<GetQueryReturns>>
          >()("get"),
        )
        .addFunction(
          FunctionSpec.convexInternalMutation<
            RegisteredMutation<
              "internal",
              RemoveMutationArgs,
              Promise<RemoveMutationReturns>
            >
          >()("remove"),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf(refs.public.notes.get).toEqualTypeOf<
      Ref.ConvexRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        GetQueryArgs,
        GetQueryReturns
      >
    >();

    expectTypeOf(refs.internal.notes.remove).toEqualTypeOf<
      Ref.ConvexRef<
        RuntimeAndFunctionType.ConvexMutation,
        "internal",
        RemoveMutationArgs,
        RemoveMutationReturns
      >
    >();

    // @ts-expect-error - remove is internal, not public
    void refs.public.notes.remove;

    // @ts-expect-error - get is public, not internal
    void refs.internal.notes.get;
  });

  it("mixes Confect and plain Convex specs", () => {
    type ConvexQueryArgs = { cursor: string };
    type ConvexQueryReturns = string[];

    const ConfectQueryArgs = { limit: Schema.Finite };
    type ConfectQueryArgs = Schema.Struct.Type<typeof ConfectQueryArgs>;

    const ConfectQueryReturns = Schema.Array(Schema.String);
    type ConfectQueryReturns = typeof ConfectQueryReturns.Type;

    const ConfectQuery = FunctionSpec.publicQuery({
      name: "list",
      args: () => ConfectQueryArgs,
      returns: () => ConfectQueryReturns,
    });

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addFunction(ConfectQuery)
        .addFunction(
          FunctionSpec.convexPublicQuery<
            RegisteredQuery<
              "public",
              ConvexQueryArgs,
              Promise<ConvexQueryReturns>
            >
          >()("search"),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf(refs.public.notes.list).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        typeof ConfectQueryArgs,
        typeof ConfectQueryReturns
      >
    >();

    expectTypeOf(refs.public.notes.search).toEqualTypeOf<
      Ref.ConvexRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        ConvexQueryArgs,
        ConvexQueryReturns
      >
    >();
  });
});

describe("middleware error unions", () => {
  it("adds them to Confect refs and keeps them off plain Convex refs", () => {
    class Blocked extends Schema.TaggedError<Blocked>()("Blocked", {}) {}

    class GateMutations extends MiddlewareSpec.MiddlewareSpec<GateMutations>()(
      "GateMutations",
      {
        error: () => Blocked,
        functionTypes: { query: false, mutation: true, action: false },
      },
    ) {}

    const spec = Spec.make().add(
      GroupSpec.makeAt("mixed")
        .middleware(GateMutations)
        .addFunction(
          FunctionSpec.publicMutation({
            name: "update",
            returns: () => Schema.Null,
          }),
        )
        .addFunction(
          FunctionSpec.convexPublicQuery<
            RegisteredQuery<"public", { cursor: string }, Promise<string[]>>
          >()("search"),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf<
      Ref.Error<typeof refs.public.mixed.update>
    >().toEqualTypeOf<Blocked>();
    expectTypeOf<Ref.Error<typeof refs.public.mixed.search>>().toBeNever();
  });
});

describe("make with middleware options", () => {
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
    expect(group.middlewareSpecs).toEqual([LazyPolicy]);
    expect(group.functions.get.middlewareSpecs).toEqual([LazyPolicy]);
    expect(
      refs.public.lazy.get.middlewareAttachments.map(({ options }) => options),
    ).toEqual([{ enabled: true }, { enabled: false }]);
    expect(evaluations).toBe(0);
    expect(Result.isSuccess(GroupSpec.validateMiddleware(group))).toBe(true);
    expect(evaluations).toBe(1);
    expect(Result.isSuccess(GroupSpec.validateMiddleware(group))).toBe(true);
    expect(evaluations).toBe(1);
  });
});
