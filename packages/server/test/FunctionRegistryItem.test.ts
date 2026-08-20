import type * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import { describe, expectTypeOf, it } from "@effect/vitest";

describe("ConvexFunctionRegistryItem", () => {
  it("carries no spec aspects or middleware surface", () => {
    expectTypeOf<
      Extract<
        keyof FunctionRegistryItem.ConvexFunctionRegistryItem,
        | "name"
        | "functionVisibility"
        | "functionType"
        | "args"
        | "returns"
        | "error"
        | "middlewareSpecs"
      >
    >().toBeNever();
  });
});
