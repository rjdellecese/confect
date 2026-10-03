import * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import { FunctionSpec, MiddlewareSpec } from "@confect/core";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

describe("make", () => {
  it("stores only ordered attachments for Confect middleware", () => {
    class Policy extends MiddlewareSpec.MiddlewareSpec<Policy>()("Policy", {
      options: () => Schema.Struct({ enabled: Schema.Boolean }),
      functionTypes: { query: true, mutation: false, action: false },
    }) {}
    const functionSpec = FunctionSpec.publicQuery({
      name: "get",
      returns: () => Schema.String,
    }).middleware(Policy, { enabled: false });
    const item = FunctionRegistryItem.make({
      functionSpec,
      groupMiddlewareAttachments: [
        { spec: Policy, options: { enabled: true } },
      ],
      handler: () => Effect.succeed("ok"),
    });

    assert(item._tag === "Confect");
    expect(item.middlewareAttachments).toEqual([
      { spec: Policy, options: { enabled: true } },
      { spec: Policy, options: { enabled: false } },
    ]);
    expect("middlewareSpecs" in item).toBe(false);
    expectTypeOf<
      Extract<
        keyof FunctionRegistryItem.ConfectFunctionRegistryItem,
        "middlewareSpecs"
      >
    >().toBeNever();
  });
});

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
        | "middlewareAttachments"
      >
    >().toBeNever();
  });
});
