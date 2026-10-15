import * as ConvexFunctionDefinitions from "@confect/server/ConvexFunctionDefinitions";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import type * as DataModel from "@confect/server/DataModel";
import { FunctionSpec, GroupSpec } from "@confect/core";
import { DatabaseSchema, FunctionImpl, GroupImpl } from "@confect/server";
import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import {
  queryGeneric,
  type GenericQueryCtx,
  type GenericMutationCtx,
  type GenericActionCtx,
} from "convex/server";
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
  const definitions = ConvexFunctionDefinitions.buildForGroup<typeof group>(
    database,
    layer,
  );
  expectTypeOf(definitions.get._tag).toEqualTypeOf<"PublicQuery">();
  expectTypeOf(definitions.native._tag).toEqualTypeOf<"Registered">();
  expectTypeOf(definitions).not.toHaveProperty("missing");
  expectTypeOf(definitions.native).not.toHaveProperty("args");
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

it("derives exact definitions for every kind and nested group", () => {
  const options = { returns: () => Schema.String };
  const group = GroupSpec.make()
    .addFunction(FunctionSpec.publicQuery({ ...options, name: "publicQuery" }))
    .addFunction(
      FunctionSpec.internalQuery({ ...options, name: "internalQuery" }),
    )
    .addFunction(
      FunctionSpec.publicMutation({ ...options, name: "publicMutation" }),
    )
    .addFunction(
      FunctionSpec.internalMutation({ ...options, name: "internalMutation" }),
    )
    .addFunction(
      FunctionSpec.publicAction({ ...options, name: "publicAction" }),
    )
    .addFunction(
      FunctionSpec.internalAction({ ...options, name: "internalAction" }),
    );
  type Nested = GroupSpec.AddGroups<
    ReturnType<typeof GroupSpec.make>,
    GroupSpec.NamedAt<typeof group, "nested">
  >;
  type Definitions = ConvexFunctionDefinitions.ForGroup<Nested>["nested"];
  type ConvexDataModel = DataModel.ToConvex<
    DataModel.FromSchema<DatabaseSchema.AnyWithProps>
  >;
  expectTypeOf<
    Definitions["publicQuery"]["_tag"]
  >().toEqualTypeOf<"PublicQuery">();
  expectTypeOf<
    Definitions["internalQuery"]["_tag"]
  >().toEqualTypeOf<"InternalQuery">();
  expectTypeOf<
    Definitions["publicMutation"]["_tag"]
  >().toEqualTypeOf<"PublicMutation">();
  expectTypeOf<
    Definitions["internalMutation"]["_tag"]
  >().toEqualTypeOf<"InternalMutation">();
  expectTypeOf<
    Definitions["publicAction"]["_tag"]
  >().toEqualTypeOf<"PublicAction">();
  expectTypeOf<
    Definitions["internalAction"]["_tag"]
  >().toEqualTypeOf<"InternalAction">();
  expectTypeOf<
    Parameters<Definitions["publicQuery"]["handler"]>[0]
  >().toEqualTypeOf<GenericQueryCtx<ConvexDataModel>>();
  expectTypeOf<
    Parameters<Definitions["publicMutation"]["handler"]>[0]
  >().toEqualTypeOf<GenericMutationCtx<ConvexDataModel>>();
  expectTypeOf<
    Parameters<Definitions["publicAction"]["handler"]>[0]
  >().toEqualTypeOf<GenericActionCtx<ConvexDataModel>>();
});

it("registers nested definitions without changing native handlers or input records", () => {
  const native = queryGeneric(() => "native");
  const leaf = RegisteredConvexFunction.Definition.Registered({
    handler: native,
  });
  const definitions = { _tag: { nested: leaf }, direct: leaf };
  const registered = ConvexFunctionDefinitions.register(definitions);
  expect(registered).toEqual({ _tag: { nested: native }, direct: native });
  expect(definitions).toEqual({ _tag: { nested: leaf }, direct: leaf });
  expect(definitions._tag.nested).toBe(leaf);
  expectTypeOf<
    Parameters<typeof ConvexFunctionDefinitions.register>["length"]
  >().toEqualTypeOf<1>();
});
