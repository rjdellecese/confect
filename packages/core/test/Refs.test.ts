import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import * as Option from "effect/Option";
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

describe("fromGroup", () => {
  it("infers direct and nested refs with public and internal type views", () => {
    const get = FunctionSpec.publicQuery({
      name: "get",
      args: () => ({ id: Schema.String }),
      returns: () => Schema.FiniteFromString,
    });
    const remove = FunctionSpec.internalMutation({
      name: "remove",
      returns: () => Schema.Null,
    });
    const send = FunctionSpec.publicNodeAction({
      name: "send",
      returns: () => Schema.String,
    });
    const search =
      FunctionSpec.convexPublicQuery<
        RegisteredQuery<"public", { cursor: string }, Promise<string[]>>
      >()("search");
    const clear =
      FunctionSpec.convexInternalMutation<
        RegisteredMutation<"internal", { id: string }, Promise<void>>
      >()("clear");
    const group = GroupSpec.withName(
      "ignored",
      GroupSpec.addGroupsAt(
        GroupSpec.make()
          .addFunction(get)
          .addFunction(remove)
          .addFunction(search)
          .addFunction(clear),
        {
          publicOnly: GroupSpec.makeNode().addFunction(send),
          internalOnly: GroupSpec.make().addFunction(remove),
          nested: GroupSpec.addGroupsAt(GroupSpec.make(), {
            leaf: GroupSpec.make().addFunction(get),
          }),
          empty: GroupSpec.make(),
        },
      ),
    );
    const refs = Refs.fromGroup("admin/notes", group);

    expectTypeOf(refs).toEqualTypeOf<Refs.FromGroup<typeof group>>();
    expectTypeOf<keyof typeof refs.public>().toEqualTypeOf<
      "get" | "search" | "publicOnly" | "nested"
    >();
    expectTypeOf<keyof typeof refs.internal>().toEqualTypeOf<
      "remove" | "clear" | "internalOnly"
    >();
    expectTypeOf(refs.public.get).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof get>
    >();
    expectTypeOf(refs.internal.remove).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof remove>
    >();
    expectTypeOf(refs.public.nested.leaf.get).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof get>
    >();
    expectTypeOf(refs.public.publicOnly.send).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof send>
    >();
    expectTypeOf(refs.public.search).toEqualTypeOf<
      Ref.ConvexRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        { cursor: string },
        string[]
      >
    >();
    expectTypeOf(refs.internal.clear).toEqualTypeOf<
      Ref.ConvexRef<
        RuntimeAndFunctionType.ConvexMutation,
        "internal",
        { id: string },
        void
      >
    >();
    expectTypeOf<Ref.Args<typeof refs.public.get>>().toEqualTypeOf<{
      readonly id: string;
    }>();
    expectTypeOf<Ref.Returns<typeof refs.public.get>>().toEqualTypeOf<number>();

    expect(refs.public).toBe(refs.internal);
    expect(Ref.getConvexFunctionName(refs.public.get)).toBe("admin/notes:get");
    expect(Ref.getConvexFunctionName(refs.internal.remove)).toBe(
      "admin/notes:remove",
    );
    expect(Ref.getConvexFunctionName(refs.public.publicOnly.send)).toBe(
      "admin/notes/publicOnly:send",
    );
    expect(Ref.getConvexFunctionName(refs.public.nested.leaf.get)).toBe(
      "admin/notes/nested/leaf:get",
    );
    expect(refs.public).not.toHaveProperty("ignored");
    expect(refs.public).not.toHaveProperty("admin");
    expect(refs.public).not.toHaveProperty("node");
    expect(refs.public).toHaveProperty("empty", {});
    const allRefs = Refs.make(
      Spec.fromGroups({
        admin: GroupSpec.addGroupsAt(GroupSpec.make(), { notes: group }),
      }),
    );
    expect(allRefs.public).toHaveProperty("admin.notes", refs.public);
  });

  it("uses the supplied namespace exactly as Ref.make does", () => {
    const get = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    });
    const group = GroupSpec.make().addFunction(get);

    for (const namespace of ["notes", "admin/notes", "external-module", ""]) {
      const refs = Refs.fromGroup(namespace, group);
      expect(Ref.getConvexFunctionName(refs.public.get)).toBe(
        Ref.getConvexFunctionName(Ref.make(namespace, get)),
      );
    }
    const empty = Refs.fromGroup("notes", GroupSpec.make());
    expect(empty).toEqual({ public: {}, internal: {} });
    expectTypeOf<keyof typeof empty.public>().toBeNever();
    expectTypeOf<keyof typeof empty.internal>().toBeNever();
  });

  it("keeps codecs lazy and memoized until the requested codec is used", () => {
    const evaluations = { args: 0, returns: 0, error: 0, unused: 0 };
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
    const get = FunctionSpec.publicQuery({
      name: "get",
      args: () => {
        evaluations.args++;
        return { count: Schema.FiniteFromString };
      },
      returns: () => {
        evaluations.returns++;
        return Schema.FiniteFromString;
      },
      error: () => {
        evaluations.error++;
        return NotFound;
      },
    });
    const group = GroupSpec.addGroupsAt(GroupSpec.make().addFunction(get), {
      unused: GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "get",
          args: () => {
            evaluations.unused++;
            return {};
          },
          returns: () => {
            evaluations.unused++;
            return Schema.String;
          },
          error: () => {
            evaluations.unused++;
            return Schema.String;
          },
        }),
      ),
    });
    const first = Refs.fromGroup("notes", group).public.get;
    const second = Refs.fromGroup("other/notes", group).public.get;
    expect(Ref.hasErrorSchema(first)).toBe(true);
    expect(evaluations).toEqual({ args: 0, returns: 0, error: 0, unused: 0 });

    expect(Ref.encodeArgsSync(first, { count: 42 })).toEqual({ count: "42" });
    expect(Ref.decodeArgsSync(second, { count: "7" })).toEqual({ count: 7 });
    expect(evaluations).toEqual({ args: 1, returns: 0, error: 0, unused: 0 });
    expect(Ref.decodeReturnsSync(first, "42")).toBe(42);
    expect(Ref.encodeReturnsSync(second, 7)).toBe("7");
    expect(evaluations).toEqual({ args: 1, returns: 1, error: 0, unused: 0 });
    expect(Ref.decodeErrorOption(first, { _tag: "NotFound" })).toEqual(
      Option.some(new NotFound()),
    );
    expect(Ref.decodeErrorOption(second, { _tag: "NotFound" })).toEqual(
      Option.some(new NotFound()),
    );
    expect(evaluations).toEqual({ args: 1, returns: 1, error: 1, unused: 0 });
    expect(first.args).toBe(second.args);
    expect(first.returns).toBe(second.returns);
    expect(first.error).toBe(second.error);
  });

  it("preserves ordered middleware attachments and lazy error unions without inheriting into children or Convex refs", () => {
    const evaluations = { groupError: 0, functionError: 0, options: 0 };
    class Denied extends Schema.TaggedError<Denied>()("Denied", {}) {}
    class Blocked extends Schema.TaggedError<Blocked>()("Blocked", {}) {}
    class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
    class Policy extends MiddlewareSpec.MiddlewareSpec<Policy>()("Policy", {
      options: () => {
        evaluations.options++;
        return Schema.Struct({ role: Schema.String });
      },
      error: () => {
        evaluations.groupError++;
        return Denied;
      },
      functionTypes: { query: false, mutation: true, action: false },
    }) {}
    class Gate extends MiddlewareSpec.MiddlewareSpec<Gate>()("Gate", {
      error: () => {
        evaluations.functionError++;
        return Blocked;
      },
      functionTypes: { query: false, mutation: true, action: false },
    }) {}
    const options = { role: "admin" };
    const update = FunctionSpec.publicMutation({
      name: "update",
      returns: () => Schema.Null,
      error: () => NotFound,
    }).middleware(Gate);
    const search =
      FunctionSpec.convexPublicQuery<
        RegisteredQuery<"public", { cursor: string }, Promise<string[]>>
      >()("search");
    const child = GroupSpec.make().addFunction(
      FunctionSpec.internalMutation({
        name: "update",
        returns: () => Schema.Null,
      }),
    );
    const group = GroupSpec.addGroupsAt(
      GroupSpec.make()
        .middleware(Policy, options)
        .addFunction(update)
        .addFunction(search),
      { child },
    );
    Object.freeze(options);
    Object.freeze(group.middlewareAttachments);
    Object.freeze(update.middlewareAttachments);
    const refs = Refs.fromGroup("notes", group);
    expectTypeOf<Ref.Error<typeof refs.public.update>>().toEqualTypeOf<
      NotFound | Denied | Blocked
    >();
    expectTypeOf<Ref.Error<typeof refs.public.search>>().toBeNever();
    expectTypeOf<Ref.Error<typeof refs.internal.child.update>>().toBeNever();
    expect(refs.public.update.middlewareAttachments).toEqual([
      group.middlewareAttachments[0],
      update.middlewareAttachments[0],
    ]);
    expect(refs.public.update.middlewareAttachments[0]).toBe(
      group.middlewareAttachments[0],
    );
    expect(refs.public.update.middlewareAttachments[1]).toBe(
      update.middlewareAttachments[0],
    );
    expect(refs.public.update.middlewareAttachments[0]?.options).toBe(options);
    expect(group.middlewareAttachments).toHaveLength(1);
    expect(update.middlewareAttachments).toHaveLength(1);
    expect(options).toEqual({ role: "admin" });
    expect(refs.public.update.middlewareSpecs).toEqual([Policy, Gate]);
    expect(refs.internal.child.update.middlewareAttachments).toEqual([]);
    expect(Ref.hasErrorSchema(refs.public.update)).toBe(true);
    expect(Ref.hasErrorSchema(refs.public.search)).toBe(false);
    expect(evaluations).toEqual({
      groupError: 0,
      functionError: 0,
      options: 0,
    });

    expect(
      Ref.decodeErrorOption(refs.public.update, { _tag: "Denied" }),
    ).toEqual(Option.some(new Denied()));
    expect(
      Ref.decodeErrorOption(refs.public.update, { _tag: "Blocked" }),
    ).toEqual(Option.some(new Blocked()));
    expect(
      Ref.decodeErrorOption(refs.public.update, { _tag: "NotFound" }),
    ).toEqual(Option.some(new NotFound()));
    expect(evaluations).toEqual({
      groupError: 1,
      functionError: 1,
      options: 0,
    });
    expect(refs.public.search).toEqual({
      _tag: "Convex",
      convexFunctionName: "notes:search",
    });
    const args = { cursor: "cursor" };
    const returns = ["note"];
    expect(Ref.encodeArgsSync(refs.public.search, args)).toBe(args);
    expect(Ref.decodeReturnsSync(refs.public.search, returns)).toBe(returns);
    expect(
      Ref.decodeErrorOption(refs.public.search, { _tag: "Denied" }),
    ).toEqual(Option.none());
    expect(
      Ref.decodeErrorOption(refs.internal.child.update, { _tag: "Denied" }),
    ).toEqual(Option.none());
  });

  it("leaves a reusable group and its nested inputs unchanged", () => {
    const get = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    });
    const leaf = GroupSpec.make().addFunction(get);
    const group = GroupSpec.withName(
      "original",
      GroupSpec.addGroupsAt(leaf, { child: leaf }),
    );
    const functions = group.functions;
    const children = group.groups;
    const attachments = group.middlewareAttachments;
    Object.freeze(get);
    Object.freeze(functions);
    Object.freeze(children);
    Object.freeze(attachments);
    Object.freeze(children.child);
    Object.freeze(group);

    const first = Refs.fromGroup("first", group);
    const second = Refs.fromGroup("second", group);
    expect(group.name).toBe("original");
    expect(group.functions).toBe(functions);
    expect(group.groups).toBe(children);
    expect(group.middlewareAttachments).toBe(attachments);
    expect(group.functions.get).toBe(get);
    expect(group.groups.child.name).toBe("child");
    expect(leaf.name).toBe("");
    expect(first.public).not.toBe(second.public);
    expect(first.public.get).not.toBe(second.public.get);
    expect(first.public.child.get).not.toBe(second.public.child.get);
    expect(Ref.getConvexFunctionName(first.public.child.get)).toBe(
      "first/child:get",
    );
    expect(Ref.getConvexFunctionName(second.public.child.get)).toBe(
      "second/child:get",
    );
    expect(Refs.make(Spec.fromGroups({ reused: group })).public).toHaveProperty(
      "reused.child.get.convexFunctionName",
      "reused/child:get",
    );
  });

  it("rejects group and function name collisions through the shared builder", () => {
    const group = GroupSpec.addGroupsAt(
      GroupSpec.make().addFunction(
        FunctionSpec.publicQuery({
          name: "get",
          returns: () => Schema.String,
        }),
      ),
      { get: GroupSpec.make() },
    );
    expect(() => Refs.fromGroup("admin/notes", group)).toThrow(
      "Group and function at same level have same name ('admin/notes:get')",
    );
    expect(group.name).toBe("");
    expect(group.groups.get.name).toBe("get");
    expect(group.functions.get.name).toBe("get");
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
