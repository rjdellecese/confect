import { UnsupportedSchemaTypeError } from "@confect/core/SchemaToValidator";
import { describe, expect, it } from "@effect/vitest";
import { v } from "convex/values";
import { vi } from "vitest";
import { toConvexDefinition } from "../../src/internal/convexDefinition";

describe("toConvexDefinition", () => {
  it("materializes each validator independently into a stable data property", () => {
    const args = { text: v.string() };
    const returns = v.array(v.string());
    const prepared = {
      args: vi.fn(() => args),
      returns: vi.fn(() => returns),
      handler: (text: string) => [text],
    };
    const definition = toConvexDefinition(prepared);

    expect(definition.handler).toBe(prepared.handler);
    expect(Object.keys(definition)).toEqual(["handler", "args", "returns"]);
    expect(prepared.args).not.toHaveBeenCalled();
    expect(prepared.returns).not.toHaveBeenCalled();

    expect(definition.returns).toBe(returns);
    expect(definition.returns).toBe(returns);
    expect(prepared.returns).toHaveBeenCalledOnce();
    expect(prepared.args).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(definition, "returns")).toEqual({
      value: returns,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    expect(definition.args).toBe(args);
    expect(definition.args).toBe(args);
    expect(prepared.args).toHaveBeenCalledOnce();
    expect(Object.getOwnPropertyDescriptor(definition, "args")).toEqual({
      value: args,
      writable: false,
      enumerable: true,
      configurable: false,
    });
    expect(Object.keys(prepared)).toEqual(["args", "returns", "handler"]);
    expect(prepared.args).toBeTypeOf("function");
    expect(prepared.returns).toBeTypeOf("function");
  });

  it("propagates a compiler failure only when its validator is requested", () => {
    const failure = new UnsupportedSchemaTypeError({ schemaType: "Symbol" });
    const prepared = {
      args: vi.fn(() => {
        throw failure;
      }),
      returns: vi.fn(() => v.null()),
      handler: () => null,
    };
    const definition = toConvexDefinition(prepared);

    expect(prepared.args).not.toHaveBeenCalled();
    expect(definition.returns.kind).toBe("null");
    expect(() => definition.args).toThrow(failure);
    expect(prepared.args).toHaveBeenCalledOnce();
    expect(prepared.returns).toHaveBeenCalledOnce();
    expect(prepared.args).toBeTypeOf("function");
  });
});
