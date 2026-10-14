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

    const notes = GroupSpec.make().addFunction(list);
    const spec = {
      [Spec.TypeId]: { notes: GroupSpec.withName("notes", notes) },
    } satisfies Spec.AnyWithProps;
    const refs = Refs.make(spec);

    const actualRef = refs.public.notes.list;
    const expectedRef = Ref.make("notes", list);

    expect(Ref.getConvexFunctionName(actualRef)).toStrictEqual(
      Ref.getConvexFunctionName(expectedRef),
    );
    expect(actualRef).toStrictEqual(expectedRef);
    expectTypeOf(actualRef).toEqualTypeOf(expectedRef);
  });

  it("derives nested and top-level refs without a separate Node namespace", () => {
    const list = FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Array(Schema.String),
    });
    const listNotes = FunctionSpec.publicQuery({
      name: "listNotes",
      returns: () => Schema.Array(Schema.String),
    });
    const send = FunctionSpec.publicNodeAction({
      name: "send",
      returns: () => Schema.Null,
    });
    const spec = Spec.fromGroups({
      databaseReader: GroupSpec.make().addFunction(listNotes),
      groups: GroupSpec.addGroupsAt(GroupSpec.make(), {
        notes: GroupSpec.make().addFunction(list),
      }),
      email: GroupSpec.makeNode().addFunction(send),
    });
    const refs = Refs.make(spec);
    const expectedRef = Ref.make("groups/notes", list);

    expect(Object.keys(refs.public).sort()).toEqual([
      "databaseReader",
      "email",
      "groups",
    ]);
    expect(refs.public).toHaveProperty("groups.notes.list", expectedRef);
    expect(refs.public).toHaveProperty(
      "groups.notes.list.convexFunctionName",
      "groups/notes:list",
    );
    expect(refs.public).toHaveProperty(
      "databaseReader.listNotes.convexFunctionName",
      "databaseReader:listNotes",
    );
    expect(refs.public).toHaveProperty(
      "email.send.convexFunctionName",
      "email:send",
    );
    expect("node" in refs.public).toBe(false);

    type Model = Spec.Spec<{
      databaseReader: GroupSpec.GroupSpec<
        "Convex",
        "databaseReader",
        typeof listNotes
      >;
      groups: GroupSpec.GroupSpec<
        "Convex",
        "groups",
        never,
        GroupSpec.GroupSpec<"Convex", "notes", typeof list>
      >;
      email: GroupSpec.GroupSpec<"Node", "email", typeof send>;
    }>;
    type PublicRefs = Refs.Refs<Model, Ref.AnyPublic>;
    expectTypeOf<keyof PublicRefs>().toEqualTypeOf<
      "databaseReader" | "groups" | "email"
    >();
    expectTypeOf<PublicRefs["groups"]["notes"]["list"]>().toEqualTypeOf<
      typeof expectedRef
    >();
    expectTypeOf<PublicRefs["email"]["send"]>().toExtend<Ref.AnyAction>();
  });

  it("throws an error if a group and function have the same name", () => {
    const list = GroupSpec.make();
    const parent = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        returns: () => Schema.Array(Schema.String),
      }),
    );
    const notes = GroupSpec.addGroupsAt(parent, {
      list,
    });
    const spec = Spec.fromGroups({ notes });
    expect(() => Refs.make(spec)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Group and function at same level have same name ('notes:list')]`,
    );
  });

  it("filters internal refs to only internal functions", () => {
    const FnReturns = Schema.String;

    const notes = GroupSpec.make()
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
      );
    const spec = {
      [Spec.TypeId]: { notes: GroupSpec.withName("notes", notes) },
    } satisfies Spec.AnyWithProps;
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

    const publicOnly = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        returns: () => FnReturns,
      }),
    );
    const internalOnly = GroupSpec.make().addFunction(
      FunctionSpec.internalQuery({
        name: "list",
        returns: () => FnReturns,
      }),
    );
    const spec = {
      [Spec.TypeId]: {
        publicOnly: GroupSpec.withName("publicOnly", publicOnly),
        internalOnly: GroupSpec.withName("internalOnly", internalOnly),
      },
    } satisfies Spec.AnyWithProps;

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

    const notes = GroupSpec.make()
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
      );
    const spec = {
      [Spec.TypeId]: { notes: GroupSpec.withName("notes", notes) },
    } satisfies Spec.AnyWithProps;
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

    const notes = GroupSpec.make().addFunction(listSpec);
    const spec = {
      [Spec.TypeId]: { notes: GroupSpec.withName("notes", notes) },
    } satisfies Spec.AnyWithProps;
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

    const notes = GroupSpec.make()
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
      );
    const spec = {
      [Spec.TypeId]: { notes: GroupSpec.withName("notes", notes) },
    } satisfies Spec.AnyWithProps;
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

    const notes = GroupSpec.make()
      .addFunction(ConfectQuery)
      .addFunction(
        FunctionSpec.convexPublicQuery<
          RegisteredQuery<
            "public",
            ConvexQueryArgs,
            Promise<ConvexQueryReturns>
          >
        >()("search"),
      );
    const spec = {
      [Spec.TypeId]: { notes: GroupSpec.withName("notes", notes) },
    } satisfies Spec.AnyWithProps;
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

    const mixed = GroupSpec.make()
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
      );
    const spec = {
      [Spec.TypeId]: { mixed: GroupSpec.withName("mixed", mixed) },
    } satisfies Spec.AnyWithProps;
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
    const parent = GroupSpec.make()
      .middleware(RequireRole, options)
      .addFunction(query.middleware(Observe));
    const child = GroupSpec.make().addFunction(query);
    const alias = GroupSpec.make().addFunction(query);
    const group = GroupSpec.addGroupsAt(parent, { child, alias });
    const spec = Spec.fromGroups({ roles: group });
    type Fixture = Spec.Spec<{
      readonly roles: GroupSpec.NamedAt<
        GroupSpec.AddGroups<
          typeof parent,
          | GroupSpec.NamedAt<typeof child, "child">
          | GroupSpec.NamedAt<typeof alias, "alias">
        >,
        "roles"
      >;
    }>;
    const refs = Refs.make(spec);
    expect(refs.public).toHaveProperty(
      "roles.get.middlewareAttachments.0.options",
      expect.toSatisfy((actual: unknown) => actual === options),
    );
    expect(refs.public).toHaveProperty(
      "roles.child.get.middlewareAttachments",
      [],
    );
    expect(refs.public).toHaveProperty(
      "roles.alias.get.middlewareAttachments",
      [],
    );
    type FixtureRefs = Refs.FromSpec<Fixture>;
    expectTypeOf<
      Ref.Error<FixtureRefs["public"]["roles"]["get"]>
    >().toEqualTypeOf<AccessDenied>();
    expectTypeOf<
      Ref.Error<FixtureRefs["public"]["roles"]["child"]["get"]>
    >().toBeNever();

    const functionGroup = GroupSpec.make().addFunction(
      query.middleware(RequireRole, options),
    );
    const functionSpec = {
      [Spec.TypeId]: { roles: GroupSpec.withName("roles", functionGroup) },
    } satisfies Spec.AnyWithProps;
    const functionRefs = Refs.make(functionSpec);
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
    const spec = Spec.fromGroups({ lazy: group });
    const refs = Refs.make(spec);
    expect(group.middlewareSpecs).toEqual([LazyPolicy]);
    expect(group.functions.get.middlewareSpecs).toEqual([LazyPolicy]);
    expect(refs.public).toHaveProperty("lazy.get.middlewareAttachments", [
      expect.objectContaining({ options: { enabled: true } }),
      expect.objectContaining({ options: { enabled: false } }),
    ]);
    expect(evaluations).toBe(0);
    expect(Result.isSuccess(GroupSpec.validateMiddleware(group))).toBe(true);
    expect(evaluations).toBe(1);
    expect(Result.isSuccess(GroupSpec.validateMiddleware(group))).toBe(true);
    expect(evaluations).toBe(1);
  });
});
