import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { GenericId, IdScope, SchemaToValidator, Table } from "@confect/core";
import type { GenericId as ConvexId } from "convex/values";
import { v } from "convex/values";
import * as Schema from "effect/Schema";

const definition = IdScope.component("@example/counter");
const first = IdScope.instance(IdScope.app, "first");
const second = IdScope.instance(IdScope.app, "second");

describe("ID scopes", () => {
  it("brands scopes without widening their identities or changing their strings", () => {
    expect(IdScope.app).toBe("");
    expect(definition).toBe("component:@example/counter");
    expect(first).toBe("/instance:first");
    expectTypeOf<typeof IdScope.app>().toEqualTypeOf<IdScope.IdScope<"">>();
    expectTypeOf<typeof definition>().toEqualTypeOf<
      IdScope.IdScope<"component:@example/counter">
    >();
    expectTypeOf<typeof first>().toEqualTypeOf<
      IdScope.Instance<IdScope.App, "first">
    >();
    expectTypeOf<typeof first>().toExtend<IdScope.IdScope>();
    expectTypeOf<typeof definition>().toExtend<IdScope.IdScope>();
    expectTypeOf<typeof IdScope.app>().toExtend<IdScope.IdScope>();
    expectTypeOf<IdScope.IdScope>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<IdScope.IdScope>();
    expectTypeOf<"">().not.toExtend<IdScope.App>();
    expectTypeOf<"component:@example/counter">().not.toExtend<
      typeof definition
    >();
    expectTypeOf<IdScope.Component<"@example/other">>().not.toExtend<
      typeof definition
    >();
    expectTypeOf<typeof first>().not.toExtend<typeof second>();
    // @ts-expect-error Scope arguments must be constructed as scopes, not raw strings.
    GenericId.GenericId("users", "component:@example/counter");
    // @ts-expect-error Instance parents must also be scopes.
    IdScope.instance("", "first");
    GenericId.rebase(
      GenericId.GenericId("users", definition),
      definition,
      // @ts-expect-error Rebasing must not introduce a raw string scope.
      "first",
    );
    // @ts-expect-error Bound tables require branded scopes too.
    Table.make(() => Schema.Struct({}))("users", "component:@example/counter");
    // @ts-expect-error Validator compilation requires a branded database scope.
    SchemaToValidator.compileReturnsSchema(Schema.String, "");
  });

  it("preserves vanilla Convex application IDs exactly", () => {
    const implicit = GenericId.GenericId("users");
    const explicit = GenericId.GenericId("users", IdScope.app);
    expectTypeOf<typeof implicit.Type>().toEqualTypeOf<ConvexId<"users">>();
    expectTypeOf<typeof explicit.Type>().toEqualTypeOf<ConvexId<"users">>();
    expect(GenericId.scope(implicit.ast)).toBe(IdScope.app);
    expect(GenericId.scope(explicit.ast)).toBe(IdScope.app);
    const bound = GenericId.rebase(implicit, IdScope.app, first);
    expectTypeOf<typeof bound.Type>().toEqualTypeOf<
      GenericId.GenericId<"users", typeof first>
    >();
    const restored = GenericId.rebase(bound, first, IdScope.app);
    expectTypeOf<typeof restored.Type>().toEqualTypeOf<ConvexId<"users">>();
  });

  it("rebases nested instance metadata and leaves unrelated scopes intact", () => {
    const child = IdScope.instance(definition, "child");
    const grandchild = IdScope.instance(child, "grandchild");
    expectTypeOf<typeof child>().toExtend<
      IdScope.IdScope<"component:@example/counter/instance:child">
    >();
    expectTypeOf<typeof grandchild>().toExtend<
      IdScope.IdScope<"component:@example/counter/instance:child/instance:grandchild">
    >();
    const expected = IdScope.instance(
      IdScope.instance(first, "child"),
      "grandchild",
    );
    const own = GenericId.GenericId("users", grandchild);
    const bound = GenericId.rebase(own, definition, first);
    expectTypeOf<typeof bound.Type>().toEqualTypeOf<
      GenericId.GenericId<"users", typeof expected>
    >();
    expect(GenericId.scope(bound.ast)).toBe(expected);
    expect(SchemaToValidator.compileReturnsSchema(bound, expected)).toEqual(
      v.id("users"),
    );
    expectTypeOf<
      IdScope.Rebase<typeof grandchild, typeof second, typeof first>
    >().toEqualTypeOf<typeof grandchild>();
    expectTypeOf<
      IdScope.Rebase<typeof definition, typeof second, typeof first>
    >().toEqualTypeOf<typeof definition>();
    type NestedMount = IdScope.Mount<
      IdScope.Mount<typeof definition, "child">,
      "grandchild"
    >;
    expectTypeOf<
      IdScope.Rebase<NestedMount, typeof definition, typeof first>
    >().toEqualTypeOf<
      IdScope.Mount<IdScope.Mount<typeof first, "child">, "grandchild">
    >();
    type InstanceInMount = IdScope.Instance<
      IdScope.Mount<typeof definition, "child">,
      "grandchild"
    >;
    expectTypeOf<
      IdScope.Rebase<InstanceInMount, typeof definition, typeof first>
    >().toEqualTypeOf<
      IdScope.Instance<IdScope.Mount<typeof first, "child">, "grandchild">
    >();
  });

  it("keeps the wire string while distinguishing tables and component instances", () => {
    const own = GenericId.GenericId("users", definition);
    const bound = GenericId.rebase(own, definition, first);
    const value = Schema.decodeUnknownSync(bound)("user-id");
    expect(value).toBe("user-id");
    expect(Schema.encodeSync(bound)(value)).toBe("user-id");

    const firstId: GenericId.GenericId<"users", typeof first> = value;
    void firstId;
    // @ts-expect-error A component ID is not an application's Convex ID.
    const appId: ConvexId<"users"> = value;
    // @ts-expect-error Installing the same definition twice creates distinct IDs.
    const secondId: GenericId.GenericId<"users", typeof second> = value;
    // @ts-expect-error Table names remain significant within a scope.
    const otherTable: GenericId.GenericId<"notes", typeof first> = value;
    void [appId, secondId, otherTable];
  });

  it("compiles local IDs as table validators and foreign IDs as strings", () => {
    const own = GenericId.GenericId("users", definition);
    const bound = GenericId.rebase(own, definition, first);
    expect(SchemaToValidator.compileReturnsSchema(own, definition)).toEqual(
      v.id("users"),
    );
    expect(SchemaToValidator.compileReturnsSchema(bound)).toEqual(v.string());
    expect(
      SchemaToValidator.compileReturnsSchema(
        GenericId.GenericId("users"),
        definition,
      ),
    ).toEqual(v.string());
  });

  it("rebinds nested and optional IDs without changing transformations or foreign IDs", () => {
    const input = Schema.Struct({
      id: GenericId.GenericId("users", definition),
      related: Schema.Array(GenericId.GenericId("users", definition)),
      owner: GenericId.GenericId("users"),
      optional: Schema.optionalKey(GenericId.GenericId("users", definition)),
      count: Schema.FiniteFromString,
    }).pipe(Schema.encodeKeys({ id: "user_id" }));
    const bound = GenericId.rebase(input, definition, first);
    const wire = {
      user_id: "one",
      related: ["two"],
      owner: "app-user",
      count: "3",
    };
    const decoded = Schema.decodeUnknownSync(bound)(wire);
    expect(decoded).toEqual({
      id: "one",
      related: ["two"],
      owner: "app-user",
      count: 3,
    });
    expect(Schema.encodeSync(bound)(decoded)).toEqual(wire);
    const appOwner: ConvexId<"users"> = decoded.owner;
    const related: GenericId.GenericId<"users", typeof first> =
      decoded.related[0]!;
    void [appOwner, related];
    expect(SchemaToValidator.compileArgsSchema(bound).owner).toEqual(
      v.id("users"),
    );
    expect(SchemaToValidator.compileArgsSchema(bound).user_id).toEqual(
      v.string(),
    );
  });

  it("scopes generated document IDs as well as authored fields", () => {
    const users = Table.make(() => Schema.Struct({ name: Schema.String }))(
      "users",
      definition,
    );
    const doc = Schema.decodeUnknownSync(users.Doc)({
      _id: "one",
      _creationTime: 0,
      name: "Ada",
    });
    const id: GenericId.GenericId<"users", typeof definition> = doc._id;
    void id;
    // @ts-expect-error Component document IDs cannot address a host table.
    const appId: ConvexId<"users"> = doc._id;
    void appId;
  });
});
