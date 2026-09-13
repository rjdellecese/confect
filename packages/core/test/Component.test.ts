import { assert, describe, expect, it } from "@effect/vitest";
import {
  Component,
  FunctionSpec,
  GenericId,
  GroupSpec,
  IdScope,
  MiddlewareAttachment,
  MiddlewareSpec,
  Ref,
  SchemaToValidator,
  Spec,
} from "@confect/core";
import { componentsGeneric, getFunctionAddress } from "convex/server";
import type { RegisteredQuery } from "convex/server";
import { v } from "convex/values";
import * as Schema from "effect/Schema";
import * as Record from "effect/Record";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { vi } from "vitest";

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
  it("keeps bound function schemas lazy and memoized across installations", () => {
    const args = vi.fn(() => ({ id: GenericId.GenericId("items", scope) }));
    const returns = vi.fn(() => GenericId.GenericId("items", scope));
    const error = vi.fn(() =>
      Schema.Struct({ id: GenericId.GenericId("items", scope) }),
    );
    const unused = vi.fn(() => Schema.String);
    const lazySpec = Spec.make().add(
      GroupSpec.makeAt("items")
        .addFunction(
          FunctionSpec.publicQuery({ name: "get", args, returns, error }),
        )
        .addFunction(
          FunctionSpec.publicQuery({ name: "unused", returns: unused }),
        ),
    );
    const lazyContract = Component.make(lazySpec, scope, ["items"]);
    const registry = componentsGeneric() as unknown as {
      first: Component.Api<typeof lazySpec, "first">;
      second: Component.Api<typeof lazySpec, "second">;
    };
    const left = Component.bind(lazyContract, registry.first);
    const right = Component.bind(lazyContract, registry.second);
    assert(
      left.items.get._tag === "Confect" && right.items.get._tag === "Confect",
    );
    expect(Ref.hasErrorSchema(left.items.get)).toBe(true);
    expect(Ref.hasErrorSchema(left.items.unused)).toBe(false);
    for (const thunk of [args, returns, error, unused])
      expect(thunk).not.toHaveBeenCalled();

    expect(left.items.get.args).toBe(left.items.get.args);
    expect(left.items.get.returns).toBe(left.items.get.returns);
    expect(left.items.get.error).toBe(left.items.get.error);
    expect(right.items.get.args).toBe(right.items.get.args);
    expect(right.items.get.returns).toBe(right.items.get.returns);
    expect(right.items.get.error).toBe(right.items.get.error);
    for (const thunk of [args, returns, error])
      expect(thunk).toHaveBeenCalledTimes(1);
    expect(unused).not.toHaveBeenCalled();
    expect(GenericId.scope(left.items.get.args.fields.id.ast)).toBe(
      GenericId.scope(Component.id(left, "items").ast),
    );
    expect(GenericId.scope(right.items.get.returns.ast)).toBe(
      GenericId.scope(Component.id(right, "items").ast),
    );
    expect(GenericId.scope(left.items.get.returns.ast)).not.toBe(
      GenericId.scope(right.items.get.returns.ast),
    );
  });

  it("keeps paginated schemas lazy when binding and inspecting the kind", () => {
    const args = vi.fn(() => ({ id: GenericId.GenericId("items", scope) }));
    const item = vi.fn(() => GenericId.GenericId("items", scope));
    const paginatedSpec = Spec.make().add(
      GroupSpec.makeAt("items").addFunction(
        FunctionSpec.publicPaginatedQuery({ name: "list", args, item }),
      ),
    );
    const registry = componentsGeneric() as unknown as {
      first: Component.Api<typeof paginatedSpec, "first">;
    };
    const bound = Component.bind(
      Component.make(paginatedSpec, scope, ["items"]),
      registry.first,
    );
    assert(bound.items.list._tag === "Confect");
    const kind = bound.items.list.kind;
    assert(kind._tag === "Paginated");
    expect(args).not.toHaveBeenCalled();
    expect(item).not.toHaveBeenCalled();
    expect(kind.userArgs).toBe(kind.userArgs);
    expect(kind.item).toBe(kind.item);
    expect(kind.page).toBe(kind.page);
    expect(bound.items.list.args).toBe(bound.items.list.args);
    expect(bound.items.list.returns).toBe(bound.items.list.returns);
    expect(args).toHaveBeenCalledTimes(1);
    expect(item).toHaveBeenCalledTimes(1);
    expect(GenericId.scope(kind.item.ast)).toBe(
      GenericId.scope(Component.id(bound, "items").ast),
    );
    expect(Schema.decodeSync(kind.page)(["one"])).toEqual(["one"]);
  });

  it("preserves middleware attachments and lazily rebinds their error schemas", () => {
    const error = vi.fn(() =>
      Schema.Struct({ id: GenericId.GenericId("items", scope) }),
    );
    class Gate extends MiddlewareSpec.MiddlewareSpec<Gate>()("ComponentGate", {
      options: () => Schema.Struct({ role: Schema.String }),
      error,
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const groupOptions = { role: "group" };
    const functionOptions = { role: "function" };
    const middlewareSpec = Spec.make().add(
      GroupSpec.makeAt("items")
        .middleware(Gate, groupOptions)
        .addFunction(
          FunctionSpec.publicQuery({
            name: "get",
            returns: () => Schema.String,
          }).middleware(Gate, functionOptions),
        ),
    );
    const registry = componentsGeneric() as unknown as {
      first: Component.Api<typeof middlewareSpec, "first">;
      second: Component.Api<typeof middlewareSpec, "second">;
    };
    const middlewareContract = Component.make(middlewareSpec, scope, ["items"]);
    const left = Component.bind(middlewareContract, registry.first);
    const right = Component.bind(middlewareContract, registry.second);
    assert(
      left.items.get._tag === "Confect" && right.items.get._tag === "Confect",
    );
    const attachments = left.items.get.middlewareAttachments;
    expect(attachments).toHaveLength(2);
    const [groupAttachment, functionAttachment] = attachments;
    assert(groupAttachment !== undefined && functionAttachment !== undefined);
    expect(groupAttachment.options).toBe(groupOptions);
    expect(functionAttachment.options).toBe(functionOptions);
    expect(groupAttachment.spec).toBe(functionAttachment.spec);
    expect(left.items.get.middlewareSpecs).toEqual(
      attachments.map(({ spec: middleware }) => middleware),
    );
    expect(MiddlewareAttachment.validateAll(attachments, "bound ref")).toEqual(
      Result.void,
    );
    expect(Ref.hasErrorSchema(left.items.get)).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(Ref.decodeErrorOption(left.items.get, { id: "one" })).toEqual(
      Option.some({ id: "one" }),
    );
    expect(error).toHaveBeenCalledTimes(1);
    expect(groupAttachment.spec.error).toBe(groupAttachment.spec.error);
    const leftError = groupAttachment.spec.error;
    const rightError = right.items.get.middlewareSpecs[0]?.error;
    assert(leftError !== undefined && rightError !== undefined);
    expect(leftError).not.toBe(rightError);
    const leftScope = GenericId.scope(Component.id(left, "items").ast);
    expect(
      SchemaToValidator.compileReturnsSchema(leftError, leftScope),
    ).toEqual(v.object({ id: v.id("items") }));
    expect(
      SchemaToValidator.compileReturnsSchema(rightError, leftScope),
    ).toEqual(v.object({ id: v.string() }));
    expect(error).toHaveBeenCalledTimes(1);
  });
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

  it("passes IDs from decoded collections to functions in the same installation", () => {
    const collectionSpec = Spec.make().add(
      GroupSpec.makeAt("items")
        .addFunction(
          FunctionSpec.publicQuery({
            name: "list",
            returns: () => Schema.toCodecJson(Schema.ReadonlySet(ItemId)),
          }),
        )
        .addFunction(
          FunctionSpec.publicQuery({
            name: "get",
            args: () => ({ id: ItemId }),
            returns: () => Schema.String,
          }),
        ),
    );
    const collectionContract = Component.make(collectionSpec, scope, ["items"]);
    const registry = componentsGeneric() as unknown as {
      first: Component.Api<typeof collectionSpec, "first">;
      second: Component.Api<typeof collectionSpec, "second">;
    };
    const firstCollection = Component.bind(collectionContract, registry.first);
    const secondCollection = Component.bind(
      collectionContract,
      registry.second,
    );
    const decoded = Ref.decodeReturnsSync(firstCollection.items.list, ["one"]);
    expect(decoded.size).toBe(1);
    for (const id of decoded) {
      expect(Ref.encodeArgsSync(firstCollection.items.get, { id })).toEqual({
        id: "one",
      });
      // @ts-expect-error Collection elements belong to the installation that returned them.
      const other: Ref.Args<typeof secondCollection.items.get> = { id };
      void other;
    }
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
