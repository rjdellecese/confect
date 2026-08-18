import type * as RegistryItem from "@confect/server/RegistryItem";
import { describe, expectTypeOf, it } from "@effect/vitest";

describe("ConvexRegistryItem", () => {
  it("carries no spec aspects or middleware surface", () => {
    expectTypeOf<
      Extract<
        keyof RegistryItem.ConvexRegistryItem,
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
