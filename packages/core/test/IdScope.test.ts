import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { GenericId, IdScope, SchemaToValidator, Table } from "@confect/core";
import type { GenericId as ConvexId } from "convex/values";
import { v } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

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
    const [firstRelated] = decoded.related;
    assert(firstRelated !== undefined);
    const related: GenericId.GenericId<"users", typeof first> = firstRelated;
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

  it.effect(
    "keeps recursive schemas lazy and memoizes shared nodes per rebasing",
    () =>
      Effect.gen(function* () {
        interface Node {
          readonly id: GenericId.GenericId<"users", typeof definition>;
          readonly children: ReadonlyArray<Node>;
        }
        let evaluations = 0;
        const node: Schema.Codec<Node> = Schema.suspend(() => {
          evaluations++;
          return Schema.Struct({
            id: GenericId.GenericId("users", definition),
            children: Schema.Array(node),
          });
        });
        const input = Schema.Struct({ left: node, right: node });
        const bound = GenericId.rebase(input, definition, first);
        const other = GenericId.rebase(input, definition, second);
        expect(evaluations).toBe(0);
        assert(SchemaAST.isObjects(bound.ast));
        const [left, right] = bound.ast.propertySignatures;
        assert(left !== undefined && right !== undefined);
        expect(left.type).toBe(right.type);
        const wire = {
          left: { id: "parent", children: [{ id: "child", children: [] }] },
          right: { id: "sibling", children: [] },
        };
        const decoded = yield* Schema.decodeUnknownEffect(bound)(wire);
        expect(decoded).toEqual(wire);
        expect(yield* Schema.encodeEffect(bound)(decoded)).toEqual(wire);
        expect(evaluations).toBe(1);
        assert(SchemaAST.isSuspend(left.type));
        const reboundNode = left.type.thunk();
        assert(SchemaAST.isObjects(reboundNode));
        const [id] = reboundNode.propertySignatures;
        assert(id !== undefined);
        expect(GenericId.scope(id.type)).toBe(first);
        assert(SchemaAST.isObjects(other.ast));
        const [otherLeft] = other.ast.propertySignatures;
        assert(otherLeft !== undefined && SchemaAST.isSuspend(otherLeft.type));
        const otherNode = otherLeft.type.thunk();
        assert(SchemaAST.isObjects(otherNode));
        const [otherId] = otherNode.propertySignatures;
        assert(otherId !== undefined);
        expect(GenericId.scope(otherId.type)).toBe(second);
      }),
  );

  it.effect(
    "rebinds IDs in collection codecs while preserving their wire values",
    () =>
      Effect.gen(function* () {
        const own = GenericId.GenericId("users", definition);
        const foreign = GenericId.GenericId("users", second);
        const input = Schema.toCodecJson(
          Schema.ReadonlyMap(
            own,
            Schema.ReadonlySet(Schema.Struct({ own, foreign })),
          ),
        );
        const bound = GenericId.rebase(input, definition, first);
        type FirstId = GenericId.GenericId<"users", typeof first>;
        type SecondId = GenericId.GenericId<"users", typeof second>;
        expectTypeOf<typeof bound.Type>().toEqualTypeOf<
          ReadonlyMap<
            FirstId,
            ReadonlySet<{ readonly own: FirstId; readonly foreign: SecondId }>
          >
        >();
        const wire: unknown = [["key", [{ own: "own", foreign: "foreign" }]]];
        const decoded = yield* Schema.decodeUnknownEffect(bound)(wire);
        expect(decoded).toEqual(
          new Map([["key", new Set([{ own: "own", foreign: "foreign" }])]]),
        );
        expect(yield* Schema.encodeEffect(bound)(decoded)).toEqual(wire);
        for (const [key, values] of decoded) {
          expectTypeOf(key).toEqualTypeOf<FirstId>();
          expect(decoded.get(key)).toBe(values);
          for (const value of values) {
            expectTypeOf(value.own).toEqualTypeOf<FirstId>();
            expectTypeOf(value.foreign).toEqualTypeOf<SecondId>();
            expectTypeOf(value.own).not.toExtend<SecondId>();
          }
        }
      }),
  );

  it("preserves collection mutability when rebasing their element types", () => {
    type DefinitionId = GenericId.GenericId<"users", typeof definition>;
    type FirstId = GenericId.GenericId<"users", typeof first>;
    expectTypeOf<
      GenericId.Rebase<
        Map<DefinitionId, Set<DefinitionId>>,
        typeof definition,
        typeof first
      >
    >().toEqualTypeOf<Map<FirstId, Set<FirstId>>>();
    expectTypeOf<
      GenericId.Rebase<
        ReadonlySet<DefinitionId>,
        typeof definition,
        typeof first
      >
    >().toEqualTypeOf<ReadonlySet<FirstId>>();
  });

  it.effect("preserves declaration codecs, refinements, and annotations", () =>
    Effect.gen(function* () {
      const input = Schema.Option(
        Schema.Struct({
          id: GenericId.GenericId("users", definition),
          count: Schema.FiniteFromString.check(Schema.isGreaterThan(0)),
        }),
      ).annotate({ identifier: "OptionalUser" });
      const bound = GenericId.rebase(input, definition, first);
      const wire = Option.some({ id: "one", count: "3" });
      const decoded = yield* Schema.decodeUnknownEffect(bound)(wire);
      expect(decoded).toEqual(Option.some({ id: "one", count: 3 }));
      expect(yield* Schema.encodeEffect(bound)(decoded)).toEqual(wire);
      expect(SchemaAST.resolveIdentifier(bound.ast)).toBe("OptionalUser");
      assert(SchemaAST.isDeclaration(bound.ast));
      const [item] = bound.ast.typeParameters;
      assert(item !== undefined && SchemaAST.isObjects(item));
      const [id] = item.propertySignatures;
      assert(id !== undefined);
      expect(GenericId.scope(id.type)).toBe(first);
      const invalid = yield* Effect.result(
        Schema.decodeUnknownEffect(bound)(
          Option.some({ id: "one", count: "-1" }),
        ),
      );
      expect(Result.isFailure(invalid)).toBe(true);
    }),
  );
});
