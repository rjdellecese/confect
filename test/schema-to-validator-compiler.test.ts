import * as Schema from "@effect/schema/Schema";
import { v } from "convex/values";
import { describe, expect, test } from "vitest";

import schemaToValidatorCompiler from "~/src/schema-to-validator-compiler";

describe("args", () => {
  test("literal", () => {
    const literalValidator = schemaToValidatorCompiler.args(
      Schema.Struct({ literalString: Schema.Literal("LiteralString") })
    );

    expect(literalValidator).toStrictEqual({
      literalString: v.literal("LiteralString"),
    });
  });

  test("string", () => {
    const stringValidator = schemaToValidatorCompiler.args(
      Schema.Struct({ string: Schema.String })
    );

    expect(stringValidator).toStrictEqual({ string: v.string() });
  });

  test("number", () => {
    const numberValidator = schemaToValidatorCompiler.args(
      Schema.Struct({ number: Schema.Number })
    );

    expect(numberValidator).toStrictEqual({ number: v.float64() });
  });

  test("empty", () => {
    const emptyObjectValidator = schemaToValidatorCompiler.args(
      Schema.Struct({})
    );

    expect(emptyObjectValidator).toStrictEqual({});
  });

  test("simple object", () => {
    const objectValidator = schemaToValidatorCompiler.args(
      Schema.Struct({
        simpleObject: Schema.Struct({
          foo: Schema.String,
          bar: Schema.Number,
        }),
      })
    );

    expect(objectValidator).toStrictEqual({
      simpleObject: v.object({ foo: v.string(), bar: v.float64() }),
    });
  });

  test("object with optional field", () => {
    const objectValidator = schemaToValidatorCompiler.args(
      Schema.Struct({
        foo: Schema.optional(Schema.Number, { exact: true }),
      })
    );

    expect(objectValidator).toStrictEqual({ foo: v.optional(v.float64()) });
  });

  test("optional union with four elements", () => {
    const optionalStringValidator = schemaToValidatorCompiler.args(
      Schema.Struct({
        union: Schema.optional(
          Schema.Union(
            Schema.String,
            Schema.Number,
            Schema.Boolean,
            Schema.Struct({})
          ),
          { exact: true }
        ),
      })
    );

    expect(optionalStringValidator).toStrictEqual({
      union: v.optional(
        v.union(v.string(), v.float64(), v.boolean(), v.object({}))
      ),
    });
  });

  test("tuple with one element", () => {
    const tupleValidator = schemaToValidatorCompiler.args(
      Schema.Struct({
        tuple: Schema.Tuple(Schema.String),
      })
    );

    expect(tupleValidator).toStrictEqual({
      tuple: v.array(v.string()),
    });
  });

  test("tuple with two elements", () => {
    const tupleValidator = schemaToValidatorCompiler.args(
      Schema.Struct({
        tuple: Schema.Tuple(Schema.String, Schema.Number),
      })
    );

    expect(tupleValidator).toStrictEqual({
      tuple: v.array(v.union(v.string(), v.float64())),
    });
  });

  test("tuple with three elements", () => {
    const tupleValidator = schemaToValidatorCompiler.args(
      Schema.Struct({
        tuple: Schema.Tuple(
          Schema.String,
          Schema.Number,
          Schema.Struct({ foo: Schema.String })
        ),
      })
    );

    expect(tupleValidator).toStrictEqual({
      tuple: v.array(
        v.union(v.string(), v.float64(), v.object({ foo: v.string() }))
      ),
    });
  });
});
