import {
  RegisteredConvexFunction,
  RegisteredConvexFunctionWithoutValidators,
  RegisteredFunctions,
} from "@confect/server";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import databaseSchema from "./mock-backend/fixtures/confect/_generated/schema";
import registeredFunctions from "./mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes";
// Imported as a value (not `import type`) because its type parameterizes
// `buildForGroup` via `typeof notesSpec`, and `typeof` requires a value
// binding.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
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

  it("RegisteredConvexFunctionWithoutValidators omits Convex args/returns validators", () => {
    const withValidators = RegisteredFunctions.buildForGroup<typeof notesSpec>(
      databaseSchema,
      notes,
      RegisteredConvexFunction.make,
    );
    const withoutValidators = RegisteredFunctions.buildForGroup<
      typeof notesSpec
    >(databaseSchema, notes, RegisteredConvexFunctionWithoutValidators.make);

    // Convex reports `v.any()` for a function registered without an args
    // validator. The default builder instead compiles a concrete object
    // validator from the args `Schema`, so the two serializations differ.
    const anyValidator = JSON.stringify({ type: "any" });
    const exportArgs = (fn: unknown) =>
      (fn as { exportArgs: () => string }).exportArgs();
    const exportReturns = (fn: unknown) =>
      (fn as { exportReturns: () => string }).exportReturns();

    expect(exportArgs(withoutValidators.insert)).toBe(anyValidator);
    expect(exportArgs(withValidators.insert)).not.toBe(anyValidator);
    // No returns validator -> Convex serializes `null`.
    expect(exportReturns(withoutValidators.insert)).toBe(JSON.stringify(null));

    // The functions themselves are still registered.
    expect(withoutValidators.list).toBeDefined();
    expect(withoutValidators.insert).toBeDefined();
  });
});
