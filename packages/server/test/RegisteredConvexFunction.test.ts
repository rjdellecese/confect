import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
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
