import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import databaseSchema from "./mock-backend/fixtures/confect/_generated/schema";
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
      RegisteredQuery<"public", Record<string, unknown>, unknown>
    >();
    expectTypeOf(registeredFunctions.getFirst).toExtend<
      RegisteredQuery<"public", Record<string, unknown>, unknown>
    >();
  });

  it("types internal Query functions as RegisteredQuery<internal, ...>", () => {
    expectTypeOf(registeredFunctions.internalGetFirst).toExtend<
      RegisteredQuery<"internal", Record<string, unknown>, unknown>
    >();
  });
});

describe("buildForGroup", () => {
  it("registers only the requested group", () => {
    const registered = RegisteredFunctions.buildForGroup<typeof notesSpec>(
      databaseSchema,
      notes,
      RegisteredConvexFunction.make,
    );

    expect(registered.list).toBeDefined();
    expect(registered.insert).toBeDefined();
  });
});
