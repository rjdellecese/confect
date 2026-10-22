import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GenericId from "@confect/core/GenericId";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Convex from "convex/server";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

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

vi.mock("@confect/core/SchemaToValidator", (importOriginal) =>
  importOriginal<typeof SchemaToValidator>().then((original) => ({
    ...original,
    compileArgsSchema: vi.fn(original.compileArgsSchema),
    compileReturnsSchema: vi.fn(original.compileReturnsSchema),
  })),
);

/**
 * The methods Convex calls on a registered function when a deployment is
 * pushed.
 */
interface Exported {
  exportArgs(): string;
  exportReturns(): string;
}

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
      const registration = vi.mocked(register);
      registration.mockClear();
      const prepared = RegisteredConvexFunction.prepare(database, item);
      expect(registration).not.toHaveBeenCalled();
      expect(prepared._tag.toLowerCase()).toBe(
        `${spec.functionVisibility}${spec.runtimeAndFunctionType.functionType}`,
      );
      RegisteredConvexFunction.register(prepared);
      expect(registration).toHaveBeenCalledExactlyOnceWith(prepared);
      const [preparedCall] = registration.mock.calls;
      assert(preparedCall);
      expect(preparedCall[0]).toBe(prepared);
      registration.mockClear();
      RegisteredConvexFunction.make(database, item);
      expect(registration).toHaveBeenCalledOnce();
      const [call] = registration.mock.calls;
      assert(call);
      const [definition] = call;
      assert(typeof definition !== "function");
      expect(definition.args).toEqual(prepared.args);
      expect(definition.returns).toEqual(prepared.returns);
      expect(item.handler).toBe(handler);
    },
  );
});

describe("register", () => {
  const options = {
    name: "list",
    args: () => ({
      projectId: GenericId.GenericId("projects"),
      cursor: Schema.optional(Schema.String),
      status: Schema.Literals(["draft", "active"]),
      filters: Schema.Array(
        Schema.Struct({
          field: Schema.String,
          value: Schema.Union([Schema.String, Schema.Finite]),
        }),
      ),
    }),
    returns: () =>
      Schema.NullOr(
        Schema.Struct({
          page: Schema.Array(
            Schema.Struct({ id: GenericId.GenericId("notes") }),
          ),
          isDone: Schema.Boolean,
          counts: Schema.Record(Schema.String, Schema.Finite),
        }),
      ),
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
    "defers compiling $name validators until Convex exports them",
    ({ spec, register }) => {
      const handler = () => Effect.succeed(null);
      const item = FunctionRegistryItem.make({
        functionSpec: spec,
        groupMiddlewareAttachments: [],
        handler,
      });
      assert(item._tag === "Confect");
      const compileArgs = vi.mocked(SchemaToValidator.compileArgsSchema);
      const compileReturns = vi.mocked(SchemaToValidator.compileReturnsSchema);
      compileArgs.mockClear();
      compileReturns.mockClear();
      const prepared = RegisteredConvexFunction.prepare(
        DatabaseSchema.make({}),
        item,
      );
      // Spread, as a generated module spreads it to replace its handler.
      const registered = RegisteredConvexFunction.register({
        ...prepared,
      }) as unknown as Exported;
      expect(compileArgs).not.toHaveBeenCalled();
      expect(compileReturns).not.toHaveBeenCalled();
      const pushed = {
        args: registered.exportArgs(),
        returns: registered.exportReturns(),
      };
      expect({
        args: registered.exportArgs(),
        returns: registered.exportReturns(),
      }).toEqual(pushed);
      expect(compileArgs).toHaveBeenCalledOnce();
      expect(compileReturns).toHaveBeenCalledOnce();
      const compiled = register({
        args: SchemaToValidator.compileArgsSchema(item.args),
        returns: SchemaToValidator.compileReturnsSchema(item.returns),
        handler: () => null,
      }) as unknown as Exported;
      expect(pushed).toEqual({
        args: compiled.exportArgs(),
        returns: compiled.exportReturns(),
      });
    },
  );

  it("registers a function whose schema does not compile, and fails its export naming it", () => {
    const item = FunctionRegistryItem.make({
      functionSpec: FunctionSpec.publicQuery({
        name: "list",
        returns: () => Schema.Undefined,
      }),
      groupMiddlewareAttachments: [],
      handler: () => Effect.void,
    });
    assert(item._tag === "Confect");
    const registered = RegisteredConvexFunction.make(
      DatabaseSchema.make({}),
      item,
    ) as unknown as Exported;
    expect(() => registered.exportReturns()).toThrow(
      `The returns schema of function "list" does not compile to a Convex validator: Unsupported schema type 'Undefined'`,
    );
  });
});
