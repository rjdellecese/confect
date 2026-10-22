import * as GenericId from "@confect/core/GenericId";
import * as SchemaToValidator from "@confect/core/SchemaToValidator";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { vi } from "vitest";
import {
  argsValidator,
  returnsValidator,
  ValidatorCompileError,
} from "../../src/internal/validators";

vi.mock("@confect/core/SchemaToValidator", (importOriginal) =>
  importOriginal<typeof SchemaToValidator>().then((original) => ({
    ...original,
    compileArgsSchema: vi.fn(original.compileArgsSchema),
    compileReturnsSchema: vi.fn(original.compileReturnsSchema),
  })),
);

const Args = Schema.Struct({
  noteId: GenericId.GenericId("notes"),
  tags: Schema.optional(Schema.Array(Schema.String)),
});
const Returns = Schema.NullOr(Schema.Struct({ pinned: Schema.Boolean }));

const compileArgs = vi.mocked(SchemaToValidator.compileArgsSchema);
const compileReturns = vi.mocked(SchemaToValidator.compileReturnsSchema);

describe("argsValidator and returnsValidator", () => {
  it("compile once, on first read, and read as the compiled validators", () => {
    const compiledArgs = SchemaToValidator.compileArgsSchema(Args);
    const compiledReturns = SchemaToValidator.compileReturnsSchema(Returns);
    compileArgs.mockClear();
    compileReturns.mockClear();
    const args = argsValidator("get", Args);
    const returns = returnsValidator("get", Returns);
    expect(compileArgs).not.toHaveBeenCalled();
    expect(compileReturns).not.toHaveBeenCalled();
    expect(args).toStrictEqual(compiledArgs);
    expect(returns).toStrictEqual(compiledReturns);
    expect(returns.isConvexValidator).toBe(true);
    expect(compileArgs).toHaveBeenCalledOnce();
    expect(compileReturns).toHaveBeenCalledOnce();
  });

  it("refuse to become non-extensible and keep reading as the compiled validators", () => {
    const args = argsValidator("get", Args);
    const returns = returnsValidator("get", Returns);
    for (const lock of [Object.preventExtensions, Object.seal, Object.freeze]) {
      expect(() => lock(args)).toThrow(TypeError);
      expect(() => lock(returns)).toThrow(TypeError);
    }
    expect(args).toStrictEqual(SchemaToValidator.compileArgsSchema(Args));
    expect(returns).toStrictEqual(
      SchemaToValidator.compileReturnsSchema(Returns),
    );
  });

  it("fail on first read, naming the function, when a schema does not compile", () => {
    const returns = returnsValidator("list", Schema.Undefined);
    expect(() => returns.isConvexValidator).toThrow(ValidatorCompileError);
    expect(() => returns.isConvexValidator).toThrow(
      `The returns schema of function "list" does not compile to a Convex validator: Unsupported schema type 'Undefined'`,
    );
  });
});
