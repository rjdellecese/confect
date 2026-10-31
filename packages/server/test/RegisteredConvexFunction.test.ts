import * as FunctionSpec from "@confect/core/FunctionSpec";
import { GenericId } from "@confect/core/GenericId";
import * as IdScope from "@confect/core/IdScope";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import type * as DataModel from "@confect/server/DataModel";
import * as DocumentIds from "@confect/server/DocumentIds";
import * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import {
  afterEach,
  assert,
  describe,
  expect,
  expectTypeOf,
  it,
} from "@effect/vitest";
import * as Convex from "convex/server";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

vi.mock("convex/server", (importOriginal) =>
  importOriginal<typeof Convex>().then((original) => ({
    ...original,
    queryGeneric: vi.fn(original.queryGeneric),
    internalQueryGeneric: vi.fn(original.internalQueryGeneric),
    mutationGeneric: vi.fn(original.mutationGeneric),
    internalMutationGeneric: vi.fn(original.internalMutationGeneric),
    actionGeneric: vi.fn(original.actionGeneric),
    internalActionGeneric: vi.fn(original.internalActionGeneric),
  })),
);

describe("make", () => {
  const componentScope = IdScope.component("counter");
  const own = GenericId("items", componentScope);
  const foreign = GenericId("items");
  const scopedOptions = {
    name: "scoped",
    args: () => ({ own, foreign }),
    returns: () => own,
  };
  it.each([
    { name: "query", spec: FunctionSpec.publicQuery(scopedOptions) },
    { name: "mutation", spec: FunctionSpec.publicMutation(scopedOptions) },
    { name: "action", spec: FunctionSpec.publicAction(scopedOptions) },
  ])("preserves component scope in lazy $name validators", ({ spec }) => {
    const scope = componentScope;
    const item = FunctionRegistryItem.make({
      functionSpec: spec,
      groupMiddlewareAttachments: [],
      handler: (args) => Effect.succeed(args.own),
    });
    assert(item._tag === "Confect");
    const compileArgs = vi.spyOn(SchemaToValidator, "compileArgsSchema");
    const compileReturns = vi.spyOn(SchemaToValidator, "compileReturnsSchema");
    const registered = RegisteredConvexFunction.make(
      DatabaseSchema.make({}, { kind: "component", scope }),
      item,
    ) as unknown as { exportArgs: () => string; exportReturns: () => string };
    expect(compileArgs).not.toHaveBeenCalled();
    expect(compileReturns).not.toHaveBeenCalled();
    expect(JSON.parse(registered.exportArgs())).toEqual({
      type: "object",
      value: {
        own: { fieldType: { type: "id", tableName: "items" }, optional: false },
        foreign: { fieldType: { type: "string" }, optional: false },
      },
    });
    expect(JSON.parse(registered.exportReturns())).toEqual({
      type: "id",
      tableName: "items",
    });
    registered.exportArgs();
    registered.exportReturns();
    expect(compileArgs).toHaveBeenCalledExactlyOnceWith(item.args, scope);
    expect(compileReturns).toHaveBeenCalledExactlyOnceWith(item.returns, scope);
  });

  it.effect.each([
    {
      name: "query",
      spec: FunctionSpec.publicQuery({
        name: "parse",
        returns: () => Schema.String,
      }),
    },
    {
      name: "mutation",
      spec: FunctionSpec.publicMutation({
        name: "parse",
        returns: () => Schema.String,
      }),
    },
  ])("provides scoped DocumentIds to a component $name", ({ spec }) =>
    Effect.gen(function* () {
      const scope = IdScope.component("@example/files");
      const database = DatabaseSchema.make({}, { kind: "component", scope });
      const item = FunctionRegistryItem.make({
        functionSpec: spec,
        groupMiddlewareAttachments: [],
        handler: () =>
          Effect.gen(function* () {
            const ids = yield* DocumentIds.DocumentIds<typeof database>();
            const id = yield* ids.parse("_storage", "file-id");
            expectTypeOf(id).toEqualTypeOf<
              Option.Option<GenericId<"_storage", typeof scope>>
            >();
            return Option.getOrThrow(id);
          }),
      });
      assert(item._tag === "Confect");
      const definition = RegisteredConvexFunction.prepare(database, item);
      assert(
        definition._tag === "PublicQuery" ||
          definition._tag === "PublicMutation",
      );
      const normalizeId = vi.fn((_table: string, input: string) => input);
      const ctx = {
        db: { system: { normalizeId } },
        storage: {},
        scheduler: {},
      } as unknown as Convex.GenericMutationCtx<
        DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema.AnyWithProps>>
      >;
      expect(yield* Effect.promise(() => definition.handler(ctx, {}))).toBe(
        "file-id",
      );
      expect(normalizeId).toHaveBeenCalledExactlyOnceWith(
        "_storage",
        "file-id",
      );
    }),
  );

  it("limits preparation to the six isolate registration kinds", () => {
    expectTypeOf<
      ReturnType<typeof RegisteredConvexFunction.prepare>["_tag"]
    >().toEqualTypeOf<
      | "PublicQuery"
      | "InternalQuery"
      | "PublicMutation"
      | "InternalMutation"
      | "PublicAction"
      | "InternalAction"
    >();
    expectTypeOf<
      Parameters<typeof RegisteredConvexFunction.make>["length"]
    >().toEqualTypeOf<2 | 3>();
  });
  const options = {
    name: "get",
    args: () => ({ value: Schema.String }),
    returns: () => Schema.String,
  };
  it.each([
    {
      name: "public query",
      spec: FunctionSpec.publicQuery(options),
      register: Convex.queryGeneric,
    },
    {
      name: "internal query",
      spec: FunctionSpec.internalQuery(options),
      register: Convex.internalQueryGeneric,
    },
    {
      name: "public mutation",
      spec: FunctionSpec.publicMutation(options),
      register: Convex.mutationGeneric,
    },
    {
      name: "internal mutation",
      spec: FunctionSpec.internalMutation(options),
      register: Convex.internalMutationGeneric,
    },
    {
      name: "public action",
      spec: FunctionSpec.publicAction(options),
      register: Convex.actionGeneric,
    },
    {
      name: "internal action",
      spec: FunctionSpec.internalAction(options),
      register: Convex.internalActionGeneric,
    },
  ])(
    "prepares a closed definition and registers a $name handler",
    ({ spec, register }) => {
      const handler = () => Effect.succeed("ok");
      const item = FunctionRegistryItem.make({
        functionSpec: spec,
        groupMiddlewareAttachments: [],
        handler,
      });
      assert(item._tag === "Confect");
      const database = DatabaseSchema.make({});
      const compileArgs = vi.spyOn(SchemaToValidator, "compileArgsSchema");
      const compileReturns = vi.spyOn(
        SchemaToValidator,
        "compileReturnsSchema",
      );
      const registration = vi.mocked(register);
      registration.mockClear();
      const prepared = RegisteredConvexFunction.prepare(database, item);
      expect(registration).not.toHaveBeenCalled();
      expect(prepared._tag.toLowerCase()).toBe(
        `${spec.functionVisibility}${spec.runtimeAndFunctionType.functionType}`,
      );
      const forwardedHandler = () => Promise.resolve("forwarded");
      const registered = RegisteredConvexFunction.register({
        ...prepared,
        handler: forwardedHandler,
      });
      expect(compileArgs).not.toHaveBeenCalled();
      expect(compileReturns).not.toHaveBeenCalled();
      expect(registration).toHaveBeenCalledOnce();
      const [preparedCall] = registration.mock.calls;
      assert(preparedCall);
      const boundary = preparedCall[0];
      assert(typeof boundary !== "function");
      expect(Object.is(boundary, prepared)).toBe(false);
      expect(boundary.handler).toBe(forwardedHandler);
      expect(Object.getOwnPropertyDescriptor(boundary, "args")).toMatchObject({
        get: expect.any(Function),
      });
      expect(
        Object.getOwnPropertyDescriptor(boundary, "returns"),
      ).toMatchObject({
        get: expect.any(Function),
      });
      const exported = registered as unknown as {
        exportArgs: () => string;
        exportReturns: () => string;
      };
      const argsJson = exported.exportArgs();
      expect(compileArgs).toHaveBeenCalledOnce();
      expect(compileReturns).not.toHaveBeenCalled();
      const returnsJson = exported.exportReturns();
      expect(compileReturns).toHaveBeenCalledOnce();
      expect(exported.exportArgs()).toBe(argsJson);
      expect(exported.exportReturns()).toBe(returnsJson);
      expect(compileArgs).toHaveBeenCalledOnce();
      expect(compileReturns).toHaveBeenCalledOnce();
      expect(JSON.parse(argsJson)).toEqual({
        type: "object",
        value: { value: { fieldType: { type: "string" }, optional: false } },
      });
      expect(JSON.parse(returnsJson)).toEqual({ type: "string" });
      registration.mockClear();
      RegisteredConvexFunction.make(database, item);
      expect(registration).toHaveBeenCalledOnce();
      const [call] = registration.mock.calls;
      assert(call);
      const [definition] = call;
      assert(typeof definition !== "function");
      expect(definition.args).toEqual(prepared.args());
      expect(definition.returns).toEqual(prepared.returns());
      expect(item.handler).toBe(handler);
    },
  );
});
