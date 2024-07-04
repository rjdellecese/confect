import { Schema } from "@effect/schema";
import { GenericId, v } from "convex/values";
import { describe, expect, expectTypeOf, test } from "vitest";

import {
  compile,
  compileSchema,
  compileTableSchema,
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

describe("compileSchema", () => {
  test("literal", () => {
    const expectedValidator = v.literal("LiteralString");

    const schema = Schema.Literal("LiteralString");
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("boolean", () => {
    const expectedValidator = v.boolean();

    const schema = Schema.Boolean;
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("string", () => {
    const expectedValidator = v.string();

    const schema = Schema.String;
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("number", () => {
    const expectedValidator = v.float64();

    const schema = Schema.Number;
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("empty object", () => {
    const expectedValidator = v.object({});

    const schema = Schema.Struct({});
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("simple object", () => {
    const expectedValidator = v.object({ foo: v.string(), bar: v.float64() });

    const schema = Schema.Struct({ foo: Schema.String, bar: Schema.Number });
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("object with optional field", () => {
    const expectedValidator = v.object({ foo: v.optional(v.string()) });

    const schema = Schema.Struct({
      foo: Schema.optional(Schema.String, { exact: true }),
    });
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("nested objects", () => {
    const expectedValidator = v.object({
      foo: v.object({ bar: v.object({ baz: v.string() }) }),
    });

    const schema = Schema.Struct({
      foo: Schema.Struct({ bar: Schema.Struct({ baz: Schema.String }) }),
    });
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("union with four elements", () => {
    const expectedValidator = v.union(
      v.string(),
      v.float64(),
      // v.boolean()
      v.object({ foo: v.string() })
    );

    const schema = Schema.Union(
      Schema.String,
      Schema.Number,
      // Schema.Boolean
      Schema.Struct({ foo: Schema.String })
    );

    const compiledValidator = compileSchema(Schema.encodedSchema(schema));

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("array", () => {
    const expectedValidator = v.array(v.string());

    const schema = Schema.Array(Schema.String);
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("array of union", () => {
    const expectedValidator = v.array(v.union(v.string(), v.float64()));

    const schema = Schema.Array(Schema.Union(Schema.String, Schema.Number));
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
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
    test("{}", () => {
      const expectedValidator = v.object({});
      type ExpectedValidator = typeof expectedValidator;

      // eslint-disable-next-line @typescript-eslint/ban-types
      type CompiledValidator = ValueToValidator<{}>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

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

    test("{ foo?: string | undefined }", () => {
      const expectedValidator = v.object({
        foo: v.optional(v.string()),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo?: string | undefined }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar?: number } }", () => {
      const expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar?: number };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar?: number | undefined } | undefined }", () => {
      const expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
      });
      type ExpectedValidator = typeof expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar?: number | undefined } | undefined;
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

describe("compileTableSchema", () => {
  test("{ text: string }", () => {
    const compiledValidator = compileTableSchema(
      Schema.Struct({
        text: Schema.String,
      })
    );

    const expectedValidator = v.object({
      text: v.string(),
    });

    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
    expect(compiledValidator).toStrictEqual(expectedValidator);
  });

  test("{ text: string, foo: { bar: number } }", () => {
    const compiledValidator = compileTableSchema(
      Schema.Struct({
        text: Schema.String,
        foo: Schema.Struct({ bar: Schema.Number }),
      })
    );

    const expectedValidator = v.object({
      text: v.string(),
      foo: v.object({ bar: v.float64() }),
    });

    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
    expect(compiledValidator).toStrictEqual(expectedValidator);
  });
});
