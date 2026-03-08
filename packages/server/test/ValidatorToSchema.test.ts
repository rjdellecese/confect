import { describe, expect, test } from "@effect/vitest";
import { v } from "convex/values";

import { compileSchema } from "../src/SchemaToValidator";
import {
  compileTableValidator,
  compileValidator,
} from "../src/ValidatorToSchema";

describe(compileValidator, () => {
  test("any", () => {
    const validator = v.any();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("string", () => {
    const validator = v.string();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("float64", () => {
    const validator = v.float64();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("int64", () => {
    const validator = v.int64();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("boolean", () => {
    const validator = v.boolean();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("null", () => {
    const validator = v.null();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("bytes", () => {
    const validator = v.bytes();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("id", () => {
    const validator = v.id("users");
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("string literal", () => {
    const validator = v.literal("LiteralString");
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("number literal", () => {
    const validator = v.literal(42);
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("boolean literal", () => {
    const validator = v.literal(true);
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("bigint literal", () => {
    const validator = v.literal(1n);
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("empty object", () => {
    const validator = v.object({});
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("simple object", () => {
    const validator = v.object({ foo: v.string(), bar: v.float64() });
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("object with optional field", () => {
    const validator = v.object({ foo: v.optional(v.string()) });
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("nested objects", () => {
    const validator = v.object({
      foo: v.object({ bar: v.object({ baz: v.string() }) }),
    });
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("object with optional nested object", () => {
    const validator = v.object({
      foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
    });
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("object with optional id field", () => {
    const validator = v.object({
      userId: v.optional(v.id("users")),
    });
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("array", () => {
    const validator = v.array(v.string());
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("nested array", () => {
    const validator = v.array(v.array(v.string()));
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("array of union", () => {
    const validator = v.array(v.union(v.string(), v.float64()));
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("union", () => {
    const validator = v.union(v.string(), v.float64());
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("four element union", () => {
    const validator = v.union(
      v.string(),
      v.float64(),
      v.boolean(),
      v.object({}),
    );
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("literal union", () => {
    const validator = v.union(v.literal("admin"), v.literal("user"));
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("object union", () => {
    const validator = v.union(
      v.object({ foo: v.string() }),
      v.object({ bar: v.float64() }),
    );
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("record", () => {
    const validator = v.record(v.string(), v.float64());
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("complex nested structure", () => {
    const validator = v.object({
      name: v.string(),
      age: v.float64(),
      active: v.boolean(),
      score: v.int64(),
      avatar: v.bytes(),
      deletedAt: v.union(v.string(), v.null()),
      tags: v.array(v.string()),
      address: v.object({
        street: v.string(),
        city: v.string(),
        zip: v.float64(),
      }),
      notes: v.optional(v.string()),
      role: v.union(v.literal("admin"), v.literal("user")),
    });
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });
});

describe(compileTableValidator, () => {
  test("succeeds for object validator", () => {
    const validator = v.object({
      foo: v.string(),
      bar: v.optional(v.object({ baz: v.float64() })),
    });
    const compiledSchema = compileTableValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("succeeds for object with optional id", () => {
    const validator = v.object({
      text: v.string(),
      userId: v.optional(v.id("users")),
    });
    const compiledSchema = compileTableValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });

  test("succeeds for union validator", () => {
    const validator = v.union(v.string(), v.float64());
    const compiledSchema = compileTableValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
  });
});
