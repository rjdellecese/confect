import { RegisteredNodeFunction } from "@confect/server/node";
import { DatabaseSchema, FunctionImpl, GroupImpl } from "@confect/server";
import { FunctionSpec, GroupSpec } from "@confect/core";
import { expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredAction } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

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
