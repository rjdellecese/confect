import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as FunctionProvenance from "@confect/core/FunctionProvenance";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

describe("Confect", () => {
  it("keeps options schema callbacks lazy and preserves exact schema types", () => {
    const fields = { count: Schema.FiniteFromString };
    const args = vi.fn(() => fields);
    const returns = vi.fn(() => Schema.String);
    const error = vi.fn(() => Schema.Boolean);
    const options = { args, returns, error };
    const provenance = FunctionProvenance.Confect(options);

    expectTypeOf(provenance).toEqualTypeOf<
      FunctionProvenance.Confect<
        typeof fields,
        typeof Schema.String,
        typeof Schema.Boolean,
        FunctionProvenance.Standard
      >
    >();
    expect(args).not.toHaveBeenCalled();
    expect(returns).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect("error" in provenance).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(options).toEqual({ args, returns, error });
    expect(provenance.args.fields).toBe(fields);
    expect(provenance.args).toBe(provenance.args);
    expect(provenance.returns).toBe(Schema.String);
    expect(provenance.returns).toBe(Schema.String);
    expect(provenance.error).toBe(Schema.Boolean);
    expect(provenance.error).toBe(Schema.Boolean);
    expect(args).toHaveBeenCalledTimes(1);
    expect(returns).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("does not install an error getter when no error callback is supplied", () => {
    const provenance = FunctionProvenance.Confect({
      args: () => ({}),
      returns: () => Schema.String,
    });

    expectTypeOf(provenance).toEqualTypeOf<
      FunctionProvenance.Confect<
        {},
        typeof Schema.String,
        never,
        FunctionProvenance.Standard
      >
    >();
    expect("error" in provenance).toBe(false);
  });
});

describe("ConfectPaginated", () => {
  it("keeps options callbacks and composed schemas lazy and memoized", () => {
    const fields = { count: Schema.FiniteFromString };
    const userArgs = vi.fn(() => fields);
    const item = vi.fn(() => Schema.FiniteFromString);
    const error = vi.fn(() => Schema.Boolean);
    const options = { userArgs, item, error };
    const provenance = FunctionProvenance.ConfectPaginated(options);

    expectTypeOf(provenance).toEqualTypeOf<
      FunctionProvenance.ConfectPaginated<
        typeof fields,
        typeof Schema.FiniteFromString,
        typeof Schema.Boolean
      >
    >();
    expect(userArgs).not.toHaveBeenCalled();
    expect(item).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect("error" in provenance).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(options).toEqual({ userArgs, item, error });
    expect(provenance.kind.userArgs.fields).toBe(fields);
    expect(provenance.kind.item).toBe(Schema.FiniteFromString);
    expect(provenance.kind.page).toBe(provenance.kind.page);
    expect(provenance.args).toBe(provenance.args);
    expect(provenance.returns).toBe(provenance.returns);
    expect(provenance.error).toBe(Schema.Boolean);
    expect(provenance.error).toBe(Schema.Boolean);
    expect(userArgs).toHaveBeenCalledTimes(1);
    expect(item).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("preserves the no-error type and absent error property", () => {
    const provenance = FunctionProvenance.ConfectPaginated({
      userArgs: () => ({}),
      item: () => Schema.String,
    });

    expectTypeOf(provenance).toEqualTypeOf<
      FunctionProvenance.ConfectPaginated<{}, typeof Schema.String>
    >();
    expect("error" in provenance).toBe(false);
  });
});
