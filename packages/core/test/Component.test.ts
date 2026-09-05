import { describe, expect, it } from "@effect/vitest";
import {
  Component,
  FunctionSpec,
  GenericId,
  GroupSpec,
  IdScope,
  Ref,
  SchemaToValidator,
  Spec,
} from "@confect/core";
import { componentsGeneric, getFunctionAddress } from "convex/server";
import type { RegisteredQuery } from "convex/server";
import { v } from "convex/values";
import * as Schema from "effect/Schema";
import * as Record from "effect/Record";

const scope = IdScope.component("@example/counter");
const ItemId = GenericId.GenericId("items", scope);
const ChildId = GenericId.GenericId("items", IdScope.instance(scope, "child"));
const spec = Spec.make().add(
  GroupSpec.makeAt("items")
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => ({ count: Schema.FiniteFromString }),
        returns: () =>
          Schema.Struct({
            id: ItemId,
            child: ChildId,
            count: Schema.FiniteFromString,
          }),
      }),
    )
    .addFunction(
      FunctionSpec.publicQuery({
        name: "get",
        args: () => ({ id: ItemId }),
        returns: () => Schema.String,
      }),
    )
    .addFunction(
      FunctionSpec.internalQuery({
        name: "secret",
        returns: () => Schema.String,
      }),
    ),
);
const contract = Component.make(spec, scope, ["items"]);
const native = componentsGeneric() as unknown as {
  first: Component.Api<typeof spec, "first">;
  second: Component.Api<typeof spec, "second">;
};
const first = Component.bind(contract, native.first);
const second = Component.bind(contract, native.second);

describe("published component contracts", () => {
  it("keeps plain Convex exports on their wire types", () => {
    const mixedSpec = Spec.make().add(
      GroupSpec.makeAt("native").addFunction(
        FunctionSpec.convexPublicQuery<
          RegisteredQuery<"public", {}, Promise<GenericId.GenericId<"items">>>
        >()("id"),
      ),
    );
    const mixedContract = Component.make(mixedSpec, scope, ["items"]);
    const registry = componentsGeneric() as unknown as {
      mixed: Component.Api<typeof mixedSpec, "mixed">;
    };
    const bound = Component.bind(mixedContract, registry.mixed);
    expect(Ref.isRef(bound.native.id)).toBe(true);
    expect(bound.native.id[Ref.TypeId]).toBe(Ref.TypeId);
    const value = Ref.decodeReturnsSync(bound.native.id, "one");
    const wire: string = value;
    // @ts-expect-error Native component IDs must not acquire a host-table brand.
    const root: GenericId.GenericId<"items"> = value;
    void [wire, root];
  });
  it("wraps a native component ref without inventing a local function name", () => {
    const wrapped = Ref.fromFunctionReference(native.first.items.create);
    expect(getFunctionAddress(Ref.getFunctionReference(wrapped))).toEqual({
      reference: "_reference/childComponent/first/items/create",
    });
    expect(Ref.encodeArgsSync(wrapped, { count: "3" })).toEqual({ count: "3" });
  });
  it("retains native references and Confect wire codecs", () => {
    expect(Ref.isRef(first.items.create)).toBe(true);
    expect(first.items.create[Ref.TypeId]).toBe(Ref.TypeId);
    expect(
      getFunctionAddress(Ref.getFunctionReference(first.items.create)),
    ).toEqual({
      reference: "_reference/childComponent/first/items/create",
    });
    expect(Ref.encodeArgsSync(first.items.create, { count: 3 })).toEqual({
      count: "3",
    });
    const decoded = Ref.decodeReturnsSync(first.items.create, {
      id: "one",
      child: "two",
      count: "3",
    });
    expect(decoded).toEqual({ id: "one", child: "two", count: 3 });
    const own: Ref.Args<typeof first.items.get> = { id: decoded.id };
    void own;
    // @ts-expect-error IDs from different installations cannot be interchanged.
    const other: Ref.Args<typeof second.items.get> = { id: decoded.id };
    // @ts-expect-error Host IDs are not component IDs, even with the same table name.
    const host: GenericId.GenericId<"items"> = decoded.id;
    void [other, host];
  });

  it("exports only public functions, as backend-only references", () => {
    expect(Record.keys(first.items)).toEqual(["create", "get"]);
    // @ts-expect-error The contract does not export private functions.
    void first.items.secret;
    // @ts-expect-error Bound refs cannot be called directly by a frontend client.
    const publicRef: Ref.AnyPublic = first.items.get;
    void publicRef;
  });

  it("reuses scoped IDs and codecs in host schemas", () => {
    const id = Schema.decodeUnknownSync(Component.id(first, "items"))("one");
    const args: Ref.Args<typeof first.items.get> = { id };
    void args;
    expect(
      SchemaToValidator.compileReturnsSchema(Component.id(first, "items")),
    ).toEqual(v.string());
    expect(
      Schema.decodeUnknownSync(Component.schema(first, ItemId))("one"),
    ).toBe(id);
    // @ts-expect-error Only declared component table names are accepted.
    Component.id(first, "missing");
  });

  it("omits empty and internal-only groups while keeping nested public exports", () => {
    const nestedSpec = Spec.make().add(
      GroupSpec.makeAt("nested")
        .addGroup(GroupSpec.makeAt("empty"))
        .addGroup(
          GroupSpec.makeAt("privateOnly").addFunction(
            FunctionSpec.internalQuery({
              name: "secret",
              returns: () => Schema.String,
            }),
          ),
        )
        .addGroup(
          GroupSpec.makeAt("publicOnly").addFunction(
            FunctionSpec.publicQuery({
              name: "get",
              returns: () => Schema.FiniteFromString,
            }),
          ),
        ),
    );
    const registry = componentsGeneric() as unknown as {
      nested: Component.Api<typeof nestedSpec, "nested">;
    };
    const bound = Component.bind(
      Component.make(nestedSpec, scope, []),
      registry.nested,
    );
    expect(Record.keys(bound.nested)).toEqual(["publicOnly"]);
    expect(Ref.decodeReturnsSync(bound.nested.publicOnly.get, "3")).toBe(3);
  });

  it("rejects group/function name collisions even for internal functions", () => {
    const conflicting = Spec.make().add(
      GroupSpec.makeAt("nested")
        .addGroup(GroupSpec.makeAt("conflict"))
        .addFunction(
          FunctionSpec.internalQuery({
            name: "conflict",
            returns: () => Schema.String,
          }),
        ),
    );
    expect(() => Component.make(conflicting, scope, [])).toThrow(
      "Group and function at same level have same name ('nested:conflict')",
    );
  });

  it("rebinds descendants when an enclosing component is installed", () => {
    const parentScope = IdScope.component("@example/parent");
    const nested = Component.bind(contract, native.first, { parentScope });
    const nestedId = Component.id(nested, "items");
    const parent = Component.make(
      Spec.make().add(
        GroupSpec.makeAt("parent").addFunction(
          FunctionSpec.publicQuery({ name: "child", returns: () => nestedId }),
        ),
      ),
      parentScope,
      [],
    );
    const registry = componentsGeneric() as unknown as {
      left: Component.Api<(typeof parent)["~Spec"], "left">;
      right: Component.Api<(typeof parent)["~Spec"], "right">;
    };
    const left = Component.bind(parent, registry.left);
    const right = Component.bind(parent, registry.right);
    const value = Ref.decodeReturnsSync(left.parent.child, "one");
    // @ts-expect-error Descendant IDs also belong to their enclosing installation.
    const wrong: Ref.Returns<typeof right.parent.child> = value;
    void wrong;
    const codec = Component.schema(left, nestedId);
    expect(GenericId.scope(codec.ast)).toContain("left");
    expect(GenericId.scope(codec.ast)).not.toContain(parentScope);
  });
});
