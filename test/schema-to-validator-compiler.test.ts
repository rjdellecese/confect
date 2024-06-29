import { Schema } from "@effect/schema";
import { GenericId, v } from "convex/values";
import { describe, expect, expectTypeOf, test } from "vitest";

import {
  compile,
  IsValueLiteral,
  UndefinedOrValueToValidator,
  UnionValueToValidator,
  ValueToValidator,
} from "~/src/schema-to-validator-compiler";

describe("compile", () => {
  test.each([
    {
      name: "literal",
      schema: Schema.Literal("LiteralString"),
      validator: v.literal("LiteralString"),
    },
    {
      name: "boolean",
      schema: Schema.Boolean,
      validator: v.boolean(),
    },
    {
      name: "string",
      schema: Schema.String,
      validator: v.string(),
    },
    {
      name: "number",
      schema: Schema.Number,
      validator: v.float64(),
    },
    {
      name: "empty object",
      schema: Schema.Struct({}),
      validator: v.object({}),
    },
    {
      name: "simple object",
      schema: Schema.Struct({ foo: Schema.String, bar: Schema.Number }),
      validator: v.object({ foo: v.string(), bar: v.float64() }),
    },
    {
      name: "object with optional field",
      schema: Schema.Struct({
        foo: Schema.optional(Schema.String, { exact: true }),
      }),
      validator: v.object({ foo: v.optional(v.string()) }),
    },
    {
      name: "nested objects",
      schema: Schema.Struct({
        foo: Schema.Struct({
          bar: Schema.Struct({
            baz: Schema.String,
          }),
        }),
      }),
      validator: v.object({
        foo: v.object({ bar: v.object({ baz: v.string() }) }),
      }),
    },
    {
      name: "union with four elements",
      schema: Schema.Union(
        Schema.String,
        Schema.Number,
        Schema.Boolean,
        Schema.Struct({})
      ),
      validator: v.union(v.string(), v.float64(), v.boolean(), v.object({})),
    },
    {
      name: "tuple with one element",
      schema: Schema.Tuple(Schema.String),
      validator: v.array(v.string()),
    },
    {
      name: "tuple with two elements",
      schema: Schema.Tuple(Schema.String, Schema.Number),
      validator: v.array(v.union(v.string(), v.float64())),
    },
    {
      name: "tuple with three elements",
      schema: Schema.Tuple(Schema.String, Schema.Number, Schema.Boolean),
      validator: v.array(v.union(v.string(), v.float64(), v.boolean())),
    },
  ])("$name", ({ schema, validator }) => {
    const compiledValidator = compile(
      Schema.encodedSchema(schema as Schema.Schema<any, any, any>).ast
    );

    expect(compiledValidator).toStrictEqual(validator);
  });
});

describe("ValueToValidator", () => {
  test("never", () => {
    type CompiledValidator = ValueToValidator<never>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<never>();
  });

  test("id", () => {
    const expectedValidator = v.id("users");
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<GenericId<"users">>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("null", () => {
    const expectedValidator = v.null();
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<null>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("boolean", () => {
    const expectedValidator = v.boolean();
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<boolean>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("number", () => {
    const expectedValidator = v.float64();
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<number>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("bigint", () => {
    const expectedValidator = v.int64();
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<bigint>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("string", () => {
    const expectedValidator = v.string();
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<string>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("bytes", () => {
    const expectedValidator = v.bytes();
    type ExpectedValidator = typeof expectedValidator;

    type CompiledValidator = ValueToValidator<ArrayBuffer>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  describe("literal", () => {
    test("string", () => {
      const expectedValidator = v.literal("foo");
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<"foo">;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("number", () => {
      const expectedValidator = v.literal(1);
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<1>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("boolean", () => {
      const expectedValidator = v.literal(true);
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<true>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("bigint", () => {
      const expectedValidator = v.literal(1n);
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<1n>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });

  describe("array", () => {
    test("string[]", () => {
      const expectedValidator = v.array(v.string());
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<string[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("number[]", () => {
      const expectedValidator = v.array(v.float64());
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<number[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("'foo'[]", () => {
      const expectedValidator = v.array(v.literal("foo"));
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<"foo"[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("string[][]", () => {
      const expectedValidator = v.array(v.array(v.string()));
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<string[][]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });

  describe("object", () => {
    test("{ foo: string }", () => {
      const expectedValidator = v.object({ foo: v.string() });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo: string }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: { bar: number } }", () => {
      const expectedValidator = v.object({
        foo: v.object({ bar: v.float64() }),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo: { bar: number };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: { bar?: number } }", () => {
      const expectedValidator = v.object({
        foo: v.object({ bar: v.optional(v.float64()) }),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo: { bar?: number };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar: number } }", () => {
      const expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.float64() })),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar: number };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: string }", () => {
      const expectedValidator = v.object({
        foo: v.optional(v.string()),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo?: string }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar?: number} }", () => {
      const expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar?: number };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });

  describe("union", () => {
    test("string | number | boolean[]", () => {
      const expectedValidator = v.union(
        v.string(),
        v.float64(),
        v.array(v.boolean())
      );
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<string | number | boolean[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });
});

describe("UndefinedOrValueToValidator", () => {
  test("string", () => {
    const expectedValidator = v.string();
    type ExpectedValidator = typeof expectedValidator;

    type ActualValidator = UndefinedOrValueToValidator<string>;

    expectTypeOf<ActualValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("string | undefined", () => {
    const expectedValidator = v.optional(v.string());
    type ExpectedValidator = typeof expectedValidator;

    type ActualValidator = UndefinedOrValueToValidator<string | undefined>;

    expectTypeOf<ActualValidator>().toEqualTypeOf<ExpectedValidator>();
  });
});

describe("UnionValueToValidator", () => {
  test("string | number", () => {
    const expectedValidator = v.union(v.string(), v.float64());
    type ExpectedValidator = typeof expectedValidator;

    type ActualValidator = UnionValueToValidator<string | number>;

    expectTypeOf<ActualValidator>().toEqualTypeOf<ExpectedValidator>();
  });
});

describe("IsValueLiteral", () => {
  describe("string", () => {
    test("literal", () => {
      type Test = IsValueLiteral<"foo">;

      expectTypeOf<Test>().toEqualTypeOf<true>();
    });

    test("non-literal", () => {
      type Test = IsValueLiteral<string>;

      expectTypeOf<Test>().toEqualTypeOf<false>();
    });
  });

  describe("number", () => {
    test("literal", () => {
      type Test = IsValueLiteral<1>;

      expectTypeOf<Test>().toEqualTypeOf<true>();
    });

    test("non-literal", () => {
      type Test = IsValueLiteral<number>;

      expectTypeOf<Test>().toEqualTypeOf<false>();
    });
  });

  describe("bigint", () => {
    test("literal", () => {
      type Test = IsValueLiteral<1n>;

      expectTypeOf<Test>().toEqualTypeOf<true>();
    });

    test("non-literal", () => {
      type Test = IsValueLiteral<bigint>;

      expectTypeOf<Test>().toEqualTypeOf<false>();
    });
  });

  describe("boolean", () => {
    test("literal", () => {
      type Test = IsValueLiteral<true>;

      expectTypeOf<Test>().toEqualTypeOf<true>();
    });

    test("non-literal", () => {
      type Test = IsValueLiteral<boolean>;

      expectTypeOf<Test>().toEqualTypeOf<false>();
    });
  });

  test("never", () => {
    type Test = IsValueLiteral<never>;

    expectTypeOf<Test>().toEqualTypeOf<never>();
  });
});
