import { RegisteredNodeFunction } from "@confect/server/node";
import {
  DatabaseSchema,
  FunctionImpl,
  FunctionRegistryItem,
  GroupImpl,
} from "@confect/server";
import { FunctionSpec, GroupSpec } from "@confect/core";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import { actionGeneric, type RegisteredAction } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

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

it("registers a Node group without a factory parameter", () => {
  const group = GroupSpec.makeNode().addFunction(
    FunctionSpec.publicNodeAction({
      name: "run",
      returns: () => Schema.String,
    }),
  );
  const database = DatabaseSchema.make({});
  const layer = GroupImpl.make(database, group).pipe(
    Layer.provide(
      FunctionImpl.make(database, group, "run", () => Effect.succeed("ok")),
    ),
    GroupImpl.finalize,
  );
  const registered = RegisteredNodeFunction.buildForGroup<typeof group>(
    database,
    layer,
  );
  expect(registered.run).toBeDefined();
  expectTypeOf(registered.run).toExtend<
    RegisteredAction<"public", Record<string, unknown>, unknown>
  >();
  expectTypeOf<
    Parameters<typeof RegisteredNodeFunction.buildForGroup>["length"]
  >().toEqualTypeOf<2>();
});

it("defers compiling a Node action's validators until Convex exports them", () => {
  const item = FunctionRegistryItem.make({
    functionSpec: FunctionSpec.internalNodeAction({
      name: "sync",
      args: () => ({
        since: Schema.Finite,
        kinds: Schema.Array(Schema.Literals(["note", "project"])),
      }),
      returns: () =>
        Schema.Struct({
          checked: Schema.Finite,
          cursor: Schema.NullOr(Schema.String),
        }),
    }),
    groupMiddlewareAttachments: [],
    handler: () => Effect.succeed({ checked: 0, cursor: null }),
  });
  assert(item._tag === "Confect");
  const compileArgs = vi.mocked(SchemaToValidator.compileArgsSchema);
  const compileReturns = vi.mocked(SchemaToValidator.compileReturnsSchema);
  compileArgs.mockClear();
  compileReturns.mockClear();
  const registered = RegisteredNodeFunction.make(
    DatabaseSchema.make({}),
    item,
  ) as unknown as Exported;
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
  const compiled = actionGeneric({
    args: SchemaToValidator.compileArgsSchema(item.args),
    returns: SchemaToValidator.compileReturnsSchema(item.returns),
    handler: () => null,
  }) as unknown as Exported;
  expect(pushed).toEqual({
    args: compiled.exportArgs(),
    returns: compiled.exportReturns(),
  });
});
