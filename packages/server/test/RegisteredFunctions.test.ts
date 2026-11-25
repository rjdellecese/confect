import { FunctionSpec, GroupSpec, MiddlewareSpec } from "@confect/core";
import {
  FunctionImpl,
  GroupImpl,
  MiddlewareImpl,
  RegisteredFunctions,
} from "@confect/server";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import tableNames from "./mock-backend/fixtures/confect/_generated/tableNames";
import registeredFunctions from "./mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes";
// Imported as a value (not `import type`) because its type parameterizes
// `buildForGroup` via `typeof notesSpec`, and `typeof` requires a value
// binding.
// oxlint-disable-next-line typescript/consistent-type-imports
import notesSpec from "./mock-backend/fixtures/confect/groups/notes.spec";
import notes from "./mock-backend/fixtures/confect/groups/notes.impl";

describe("Registered functions", () => {
  it("types public Query functions as RegisteredQuery<public, ...>", () => {
    expectTypeOf(registeredFunctions.list).toExtend<
      RegisteredQuery<"public", Record<never, never>, unknown>
    >();
    expectTypeOf(registeredFunctions.getFirst).toExtend<
      RegisteredQuery<"public", Record<never, never>, unknown>
    >();
  });

  it("types internal Query functions as RegisteredQuery<internal, ...>", () => {
    expectTypeOf(registeredFunctions.internalGetFirst).toExtend<
      RegisteredQuery<"internal", Record<never, never>, unknown>
    >();
  });
});

describe("buildForGroup", () => {
  it("accepts only table names and the finalized group layer", () => {
    expectTypeOf<
      Parameters<typeof RegisteredFunctions.buildForGroup>["length"]
    >().toEqualTypeOf<2>();
  });
  it("rejects an implementation registered for a different same-key spec", () => {
    class Policy extends MiddlewareSpec.MiddlewareSpec<Policy>()("Policy", {
      options: () => Schema.Struct({ label: Schema.String }),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    class OtherPolicy extends MiddlewareSpec.MiddlewareSpec<OtherPolicy>()(
      "Policy",
      {
        options: () => Schema.Struct({ count: Schema.Finite }),
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    class SameShapePolicy extends MiddlewareSpec.MiddlewareSpec<SameShapePolicy>()(
      "Policy",
      {
        options: () => Schema.Struct({ label: Schema.String }),
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}

    const query = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    }).middleware(Policy, { label: "internal" });
    const group = GroupSpec.make().addFunction(query);

    for (const implementationSpec of [OtherPolicy, SameShapePolicy]) {
      const layer = GroupImpl.make(group).pipe(
        Layer.provide(
          FunctionImpl.make(group, "get", () => Effect.succeed("ok")),
        ),
        Layer.provide(
          MiddlewareImpl.make(implementationSpec, (effect) => effect),
        ),
        GroupImpl.finalize,
      );
      expect(() =>
        RegisteredFunctions.buildForGroup<typeof group>(tableNames, layer),
      ).toThrowError(/Middleware "Policy".*function "get".*different spec/);
    }
  });

  it("rejects equivalent options during registration without requiring codegen", () => {
    class GroupPolicy extends MiddlewareSpec.MiddlewareSpec<GroupPolicy>()(
      "GroupPolicy",
      {
        options: () => Schema.Struct({ label: Schema.String }),
        functionTypes: { query: true, mutation: true, action: true },
      },
    ) {}

    const query = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    }).middleware(GroupPolicy, { label: "same" });
    const group = GroupSpec.make()
      .middleware(GroupPolicy, { label: "same" })
      .addFunction(query);
    const layer = GroupImpl.make(group).pipe(
      Layer.provide(
        FunctionImpl.make(group, "get", () => Effect.succeed("ok")),
      ),
      Layer.provide(MiddlewareImpl.make(GroupPolicy, (effect) => effect)),
      GroupImpl.finalize,
    );
    expect(() =>
      RegisteredFunctions.buildForGroup<typeof group>(tableNames, layer),
    ).toThrowError(/GroupPolicy.*equivalent options.*function "get"/);
  });

  it("registers only the requested group", () => {
    const registered = RegisteredFunctions.buildForGroup<typeof notesSpec>(
      tableNames,
      notes,
    );

    expect(registered.list).toBeDefined();
    expect(registered.insert).toBeDefined();
  });
});
