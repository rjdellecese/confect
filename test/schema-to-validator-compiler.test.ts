import * as Schema from "@effect/schema/Schema";
import { v } from "convex/values";
import { describe, expect, test } from "vitest";

import schemaToValidatorCompiler from "../src/schema-to-validator-compiler";

describe("args", () => {
  test("literal", () => {
    const literalValidator = schemaToValidatorCompiler.args(
      Schema.struct({ literalString: Schema.literal("LiteralString") })
    );

    expect(literalValidator).toStrictEqual({
      literalString: v.literal("LiteralString"),
    });
  });

  test("string", () => {
    const stringValidator = schemaToValidatorCompiler.args(
      Schema.struct({ string: Schema.string })
    );

    expect(stringValidator).toStrictEqual({ string: v.string() });
  });

  test("number", () => {
    const numberValidator = schemaToValidatorCompiler.args(
      Schema.struct({ number: Schema.number })
    );

    expect(numberValidator).toStrictEqual({ number: v.float64() });
  });

  test("empty", () => {
    const emptyObjectValidator = schemaToValidatorCompiler.args(
      Schema.struct({})
    );

    expect(emptyObjectValidator).toStrictEqual({});
  });

  test("simple object", () => {
    const objectValidator = schemaToValidatorCompiler.args(
      Schema.struct({
        simpleObject: Schema.struct({
          foo: Schema.string,
          bar: Schema.number,
        }),
      })
    );

    expect(objectValidator).toStrictEqual({
      simpleObject: v.object({ foo: v.string(), bar: v.float64() }),
    });
  });

  test("object with optional field", () => {
    const objectValidator = schemaToValidatorCompiler.args(
      Schema.struct({
        foo: Schema.optional(Schema.number),
      })
    );

    expect(objectValidator).toStrictEqual({ foo: v.optional(v.float64()) });
  });

  test("optional union with four elements", () => {
    const optionalStringValidator = schemaToValidatorCompiler.args(
      Schema.struct({
        union: Schema.optional(
          Schema.union(
            Schema.string,
            Schema.number,
            Schema.boolean,
            Schema.struct({})
          )
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
      Schema.struct({
        tuple: Schema.tuple(Schema.string),
      })
    );

    expect(tupleValidator).toStrictEqual({
      tuple: v.array(v.string()),
    });
  });

  test("tuple with two elements", () => {
    const tupleValidator = schemaToValidatorCompiler.args(
      Schema.struct({
        tuple: Schema.tuple(Schema.string, Schema.number),
      })
    );

    expect(tupleValidator).toStrictEqual({
      tuple: v.array(v.union(v.string(), v.float64())),
    });
  });

  test("tuple with three elements", () => {
    const tupleValidator = schemaToValidatorCompiler.args(
      Schema.struct({
        tuple: Schema.tuple(
          Schema.string,
          Schema.number,
          Schema.struct({ foo: Schema.string })
        ),
      })
    );

    expect(tupleValidator).toStrictEqual({
      tuple: v.array(
        v.union(v.string(), v.float64(), v.object({ foo: v.string() }))
      ),
    });
  });

  test("record", () => {
    const recordValidator = schemaToValidatorCompiler.args(
      Schema.struct({
        record: Schema.record(Schema.string, Schema.number),
      })
    );

    expect(recordValidator).toStrictEqual({
      record: v.record(v.string(), v.number()),
    });
  });
});
