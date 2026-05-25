import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import api from "./mock-backend/fixtures/confect/_generated/api";
import registeredFunctions from "./mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes";
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
    const registered = RegisteredFunctions.buildForGroup(
      api,
      "groups.notes",
      notes,
      RegisteredConvexFunction.make,
    );

    expect(registered.list).toBeDefined();
    expect(registered.insert).toBeDefined();
  });
});
