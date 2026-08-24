import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Ref from "@confect/core/Ref";
import * as Refs from "@confect/core/Refs";
import type * as RuntimeAndFunctionType from "@confect/core/RuntimeAndFunctionType";
import * as Spec from "@confect/core/Spec";

describe("make", () => {
  it("turns a spec into refs", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.Array(Schema.String);

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes").addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: () => FnArgs,
          returns: () => FnReturns,
        }),
      ),
    );
    const refs = Refs.make(spec);

    const actualRef = refs.public.notes.list;
    const expectedRef = Ref.make(
      "notes",
      FunctionSpec.publicQuery({
        name: "list",
        args: () => FnArgs,
        returns: () => FnReturns,
      }),
    );

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
            args: () => Schema.Struct({}),
            returns: () => Schema.Array(Schema.String),
          }),
        ),
    );
    expect(() => Refs.make(spec)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Group and function at same level have same name ('notes:list')]`,
    );
  });

  it("filters internal refs to only internal functions", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.String;

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addFunction(
          FunctionSpec.publicQuery({
            name: "publicList",
            args: () => FnArgs,
            returns: () => FnReturns,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalList",
            args: () => FnArgs,
            returns: () => FnReturns,
          }),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf(refs.internal.notes.internalList).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "internal",
        typeof FnArgs.Type,
        typeof FnReturns.Type,
        never,
        typeof FnArgs,
        typeof FnReturns,
        never
      >
    >();

    // @ts-expect-error - publicList should be filtered out
    void refs.internal.notes.publicList;
  });

  it("filters out groups with no matching functions", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.String;

    const spec = Spec.make()
      .add(
        GroupSpec.makeAt("publicOnly").addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            args: () => FnArgs,
            returns: () => FnReturns,
          }),
        ),
      )
      .add(
        GroupSpec.makeAt("internalOnly").addFunction(
          FunctionSpec.internalQuery({
            name: "list",
            args: () => FnArgs,
            returns: () => FnReturns,
          }),
        ),
      );

    const refs = Refs.make(spec);

    expectTypeOf(refs.internal.internalOnly.list).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "internal",
        typeof FnArgs.Type,
        typeof FnReturns.Type,
        never,
        typeof FnArgs,
        typeof FnReturns,
        never
      >
    >();

    // @ts-expect-error - publicOnly group should be filtered out entirely
    void refs.internal.publicOnly;
  });

  it("filters public refs to only public functions", () => {
    const FnArgs = Schema.Struct({});
    const FnReturns = Schema.String;

    const spec = Spec.make().add(
      GroupSpec.makeAt("notes")
        .addFunction(
          FunctionSpec.publicQuery({
            name: "publicList",
            args: () => FnArgs,
            returns: () => FnReturns,
          }),
        )
        .addFunction(
          FunctionSpec.internalQuery({
            name: "internalList",
            args: () => FnArgs,
            returns: () => FnReturns,
          }),
        ),
    );
    const refs = Refs.make(spec);

    expectTypeOf(refs.public.notes.publicList).toEqualTypeOf<
      Ref.ConfectRef<
        RuntimeAndFunctionType.ConvexQuery,
        "public",
        typeof FnArgs.Type,
        typeof FnReturns.Type,
        never,
        typeof FnArgs,
        typeof FnReturns,
        never
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

    const ConfectQueryArgs = Schema.Struct({ limit: Schema.Finite });
    type ConfectQueryArgs = typeof ConfectQueryArgs.Type;

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
        ConfectQueryArgs,
        ConfectQueryReturns,
        never,
        typeof ConfectQueryArgs,
        typeof ConfectQueryReturns,
        never
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
            args: () => Schema.Struct({}),
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
