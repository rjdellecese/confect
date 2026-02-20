import { describe, expectTypeOf, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import registeredFunctions from "./confect/_generated/registeredFunctions";

describe("RegisteredFunctions", () => {
  it("types public Query functions as RegisteredQuery<public, ...>", () => {
    expectTypeOf(registeredFunctions.groups.notes.list).toExtend<
      RegisteredQuery<"public", Record<string, unknown>, unknown>
    >();
    expectTypeOf(registeredFunctions.groups.notes.getFirst).toExtend<
      RegisteredQuery<"public", Record<string, unknown>, unknown>
    >();
  });

  it("types internal Query functions as RegisteredQuery<internal, ...>", () => {
    expectTypeOf(registeredFunctions.groups.notes.internalGetFirst).toExtend<
      RegisteredQuery<"internal", Record<string, unknown>, unknown>
    >();
  });
});
