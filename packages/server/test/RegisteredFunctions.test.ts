import { describe, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import registeredFunctions from "./mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes";

describe("RegisteredFunctions", () => {
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
