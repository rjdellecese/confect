import * as ConvexFunctionDefinitions from "@confect/server/ConvexFunctionDefinitions";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import { FunctionSpec, GroupSpec } from "@confect/core";
import { DatabaseSchema, FunctionImpl, GroupImpl } from "@confect/server";
import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import { queryGeneric } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

it("prepares only its own functions and preserves native registrations", () => {
  const native = queryGeneric(() => "native");
  const group = GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({ name: "get", returns: () => Schema.String }),
    )
    .addFunction(FunctionSpec.convexPublicQuery<typeof native>()("native"));
  const database = DatabaseSchema.make({});
  const layer = GroupImpl.make(database, group).pipe(
    Layer.provide(
      FunctionImpl.make(database, group, "get", () => Effect.succeed("ok")),
    ),
    Layer.provide(FunctionImpl.make(database, group, "native", native)),
    GroupImpl.finalize,
  );
  const definitions = ConvexFunctionDefinitions.buildForGroup(database, layer);
  expect(Object.keys(definitions).sort()).toEqual(["get", "native"]);
  const prepared = definitions.get;
  assert(prepared && ConvexFunctionDefinitions.isDefinition(prepared));
  expect(prepared._tag).toBe("PublicQuery");
  const registered = definitions.native;
  assert(registered && ConvexFunctionDefinitions.isDefinition(registered));
  assert(RegisteredConvexFunction.Definition.$is("Registered")(registered));
  expect(registered.handler).toBe(native);
  expect(ConvexFunctionDefinitions.isDefinition({ _tag: prepared })).toBe(
    false,
  );
  expectTypeOf<
    Parameters<typeof ConvexFunctionDefinitions.buildForGroup>["length"]
  >().toEqualTypeOf<2>();
});
