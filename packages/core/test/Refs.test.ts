import * as Record from "effect/Record";
import * as String from "effect/String";
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

describe("root groups", () => {
  it("flattens own functions and children while preserving physical paths, types, and middleware scope", () => {
    let evaluations = 0;
    class Denied extends Schema.TaggedError<Denied, {}>()("Denied", {}) {}
    class Gate extends MiddlewareSpec.MiddlewareSpec<Gate>()("rootGate", {
      functionTypes: { query: true, mutation: true, action: true },
      error: () => {
        evaluations++;
        return Denied;
      },
      options: () => {
        evaluations++;
        return Schema.Struct({ enabled: Schema.Boolean });
      },
    }) {}
    const greet = FunctionSpec.publicQuery({
      name: "greet",
      args: () => {
        evaluations++;
        return { name: Schema.String };
      },
      returns: () => {
        evaluations++;
        return Schema.String;
      },
    });
    const hidden = FunctionSpec.internalMutation({
      name: "hidden",
      returns: () => Schema.Null,
    });
    const send = FunctionSpec.publicNodeAction({
      name: "send",
      returns: () => Schema.String,
    });
    const options = { enabled: true };
    const leaf = GroupSpec.make({ root: true })
      .middleware(Gate, options)
      .addFunction(greet)
      .addFunction(hidden);
    const children = {
      nested: GroupSpec.makeNode().addFunction(send),
      privateOnly: GroupSpec.make().addFunction(hidden),
    };
    const root = GroupSpec.addGroupsAt(leaf, children);
    const named = GroupSpec.make().addFunction(greet);
    type Fixture = Spec.Spec<{
      app: GroupSpec.NamedAt<
        GroupSpec.AddGroups<
          typeof leaf,
          | GroupSpec.NamedAt<typeof children.nested, "nested">
          | GroupSpec.NamedAt<typeof children.privateOnly, "privateOnly">
        >,
        "app"
      >;
      named: GroupSpec.NamedAt<typeof named, "named">;
    }>;
    const spec = {
      [Spec.TypeId]: {
        app: GroupSpec.withName("app", root),
        named: GroupSpec.withName("named", named),
      },
    } as Fixture;
    const refs = Refs.make(spec);
    const assembled = Refs.make(Spec.fromGroups({ app: root, named }));
    expect(assembled.public).toHaveProperty(
      "greet.convexFunctionName",
      "app:greet",
    );
    expect(Ref.getConvexFunctionName(refs.public.greet)).toBe("app:greet");
    expect(Ref.getConvexFunctionName(refs.internal.hidden)).toBe("app:hidden");
    expect(Ref.getConvexFunctionName(refs.public.nested.send)).toBe(
      "app/nested:send",
    );
    expect(Ref.getConvexFunctionName(refs.public.named.greet)).toBe(
      "named:greet",
    );
    expectTypeOf<keyof typeof refs.public>().toEqualTypeOf<
      "greet" | "nested" | "named"
    >();
    expectTypeOf<keyof typeof refs.internal>().toEqualTypeOf<
      "hidden" | "privateOnly"
    >();
    expectTypeOf(refs.public.greet).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof greet, Denied>
    >();
    expectTypeOf(refs.internal.hidden).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof hidden, Denied>
    >();
    expectTypeOf(refs.public.nested.send).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof send>
    >();
    expectTypeOf<Ref.Error<typeof refs.public.named.greet>>().toBeNever();
    expect(refs.public.greet.middlewareAttachments[0]?.options).toBe(options);
    expect(refs.public.nested.send.middlewareAttachments).toEqual([]);
    expect(refs.public.named.greet.middlewareAttachments).toEqual([]);
    expect(refs.public).not.toHaveProperty("app");
    expect(root.name).toBe("");
    expect(evaluations).toBe(0);
  });

  it("supports Node roots and plain Convex function refs", () => {
    const send = FunctionSpec.publicNodeAction({
      name: "send",
      returns: () => Schema.Null,
    });
    const query =
      FunctionSpec.convexPublicQuery<
        RegisteredQuery<"public", { id: string }, Promise<string>>
      >()("get");
    const leaf = GroupSpec.makeNode({ root: true }).addFunction(send);
    const nested = GroupSpec.make().addFunction(query);
    const node = GroupSpec.addGroupsAt(leaf, { nested });
    type Fixture = Spec.Spec<{
      node: GroupSpec.NamedAt<
        GroupSpec.AddGroups<
          typeof leaf,
          GroupSpec.NamedAt<typeof nested, "nested">
        >,
        "node"
      >;
    }>;
    const refs = Refs.make({
      [Spec.TypeId]: { node: GroupSpec.withName("node", node) },
    } as Fixture);
    expect(Ref.getConvexFunctionName(refs.public.send)).toBe("node:send");
    expect(Ref.getConvexFunctionName(refs.public.nested.get)).toBe(
      "node/nested:get",
    );
    expectTypeOf(refs.public.send).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof send>
    >();
    expectTypeOf(refs.public.nested.get).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof query>
    >();
    const convex = GroupSpec.make({ root: true }).addFunction(query);
    const convexRefs = Refs.make({
      [Spec.TypeId]: { root: GroupSpec.withName("root", convex) },
    });
    expect(Ref.getConvexFunctionName(convexRefs.public.get)).toBe("root:get");
    expectTypeOf(convexRefs.public.get).toEqualTypeOf<
      Ref.FromFunctionSpec<typeof query>
    >();
  });

  it("handles empty roots and special names without prototype writes", () => {
    const empty = GroupSpec.make({ root: true });
    const emptyRefs = Refs.make({
      [Spec.TypeId]: { root: GroupSpec.withName("root", empty) },
    });
    expect(emptyRefs.public).toEqual({});
    expectTypeOf<keyof typeof emptyRefs.public>().toBeNever();
    const fn = FunctionSpec.publicQuery({
      name: "__proto__",
      returns: () => Schema.Null,
    });
    const group = GroupSpec.addGroupsAt(empty.addFunction(fn), {
      constructor: GroupSpec.make().addFunction(fn),
    });
    const refs = Refs.make({
      [Spec.TypeId]: { root: GroupSpec.withName("root", group) },
    });
    const publicRefs: Record.ReadonlyRecord<string, unknown> = refs.public;
    expect(Record.has(publicRefs, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(refs.public)).toBe(Object.prototype);
    expect(publicRefs.__proto__).toHaveProperty(
      "convexFunctionName",
      "root:__proto__",
    );
    expect(publicRefs.constructor).toMatchObject({
      ["__proto__"]: { convexFunctionName: "root/constructor:__proto__" },
    });
  });

  it("validates hand-assembled specs before creating refs", () => {
    const root = GroupSpec.make({ root: true });
    expect(() =>
      Refs.make({ [Spec.TypeId]: { app: root, other: root } }),
    ).toThrow("Only one root group");
    expect(() =>
      Refs.make({
        [Spec.TypeId]: {
          parent: GroupSpec.addGroupsAt(GroupSpec.make(), { nested: root }),
        },
      }),
    ).toThrow("must be at the top level");
    const conflicting = root.addFunction(
      FunctionSpec.internalQuery({ name: "notes", returns: () => Schema.Null }),
    );
    expect(() =>
      Refs.make({
        [Spec.TypeId]: { app: conflicting, notes: GroupSpec.make() },
      }),
    ).toThrow('Root ref name "notes" collides');
  });
});

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

    expect(Record.keys(refs.public).sort(String.Order)).toEqual([
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
    class Blocked extends Schema.TaggedError<Blocked, {}>()("Blocked", {}) {}

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
  class AccessDenied extends Schema.TaggedError<AccessDenied, {}>()(
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
