import { describe, effect, expect, expectTypeOf, test } from "@effect/vitest";
import type {
  VAny,
  VArray,
  VBoolean,
  VBytes,
  VFloat64,
  VId,
  VInt64,
  VLiteral,
  VNull,
  VObject,
  VRecord,
  VString,
  VUnion,
} from "convex/values";
import { v } from "convex/values";
import { Effect, type Schema } from "effect";

import type { GenericId } from "@confect/core/GenericId";
import { compileSchema } from "../src/SchemaToValidator";
import {
  compilePropertyValidators,
  compileTableValidator,
  compileValidator,
  compileValidatorEffect,
  type ValidatorToValue,
} from "../src/ValidatorToSchema";

describe(compileValidatorEffect, () => {
  describe("primitives", () => {
    effect("any", () =>
      Effect.gen(function* () {
        const validator = v.any();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("string", () =>
      Effect.gen(function* () {
        const validator = v.string();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("float64", () =>
      Effect.gen(function* () {
        const validator = v.float64();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("int64", () =>
      Effect.gen(function* () {
        const validator = v.int64();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("boolean", () =>
      Effect.gen(function* () {
        const validator = v.boolean();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("null", () =>
      Effect.gen(function* () {
        const validator = v.null();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("bytes", () =>
      Effect.gen(function* () {
        const validator = v.bytes();
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });

  describe("literals", () => {
    effect("string literal", () =>
      Effect.gen(function* () {
        const validator = v.literal("LiteralString");
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("number literal", () =>
      Effect.gen(function* () {
        const validator = v.literal(42);
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("boolean literal", () =>
      Effect.gen(function* () {
        const validator = v.literal(true);
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("bigint literal", () =>
      Effect.gen(function* () {
        const validator = v.literal(1n);
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });

  describe("id", () => {
    effect("generic id", () =>
      Effect.gen(function* () {
        const validator = v.id("users");
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });

  describe("array", () => {
    effect("simple array", () =>
      Effect.gen(function* () {
        const validator = v.array(v.string());
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("nested array", () =>
      Effect.gen(function* () {
        const validator = v.array(v.array(v.float64()));
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("array of union", () =>
      Effect.gen(function* () {
        const validator = v.array(v.union(v.string(), v.float64()));
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });

  describe("object", () => {
    effect("empty object", () =>
      Effect.gen(function* () {
        const validator = v.object({});
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("simple object", () =>
      Effect.gen(function* () {
        const validator = v.object({ foo: v.string(), bar: v.float64() });
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("object with optional field", () =>
      Effect.gen(function* () {
        const validator = v.object({ foo: v.optional(v.string()) });
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("nested objects", () =>
      Effect.gen(function* () {
        const validator = v.object({
          foo: v.object({ bar: v.object({ baz: v.string() }) }),
        });
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("object with optional nested object", () =>
      Effect.gen(function* () {
        const validator = v.object({
          foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
        });
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("object with optional id field", () =>
      Effect.gen(function* () {
        const validator = v.object({
          userId: v.optional(v.id("users")),
        });
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });

  describe("union", () => {
    effect("two element union", () =>
      Effect.gen(function* () {
        const validator = v.union(v.string(), v.float64());
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("four element union", () =>
      Effect.gen(function* () {
        const validator = v.union(
          v.string(),
          v.float64(),
          v.boolean(),
          v.object({}),
        );
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("literal union", () =>
      Effect.gen(function* () {
        const validator = v.union(v.literal("admin"), v.literal("user"));
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );

    effect("object union", () =>
      Effect.gen(function* () {
        const validator = v.union(
          v.object({ foo: v.string() }),
          v.object({ bar: v.float64() }),
        );
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });

  describe("record", () => {
    effect("simple record", () =>
      Effect.gen(function* () {
        const validator = v.record(v.string(), v.float64());
        const compiledSchema = yield* compileValidatorEffect(validator);
        const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

        expect(roundtripped).toStrictEqual(validator);
      }),
    );
  });
});

describe(compileValidator, () => {
  test("any", () => {
    const validator = v.any();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<any>>();
  });

  test("string", () => {
    const validator = v.string();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<string>>();
  });

  test("float64", () => {
    const validator = v.float64();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<number>>();
  });

  test("int64", () => {
    const validator = v.int64();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<bigint>>();
  });

  test("boolean", () => {
    const validator = v.boolean();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<boolean>>();
  });

  test("null", () => {
    const validator = v.null();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<null>>();
  });

  test("bytes", () => {
    const validator = v.bytes();
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<ArrayBuffer>>();
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
    expectTypeOf(compiledSchema).toEqualTypeOf<
      Schema.Schema<"LiteralString">
    >();
  });

  test("number literal", () => {
    const validator = v.literal(42);
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<42>>();
  });

  test("boolean literal", () => {
    const validator = v.literal(true);
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<true>>();
  });

  test("bigint literal", () => {
    const validator = v.literal(1n);
    const compiledSchema = compileValidator(validator);
    const roundtripped = compileSchema(compiledSchema);

    expect(roundtripped).toStrictEqual(validator);
    expectTypeOf(compiledSchema).toEqualTypeOf<Schema.Schema<1n>>();
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

  test("literal union", () => {
    const validator = v.union(v.literal("admin"), v.literal("user"));
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

  test("object with optional id field", () => {
    const validator = v.object({
      userId: v.optional(v.id("users")),
    });
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

describe("ValidatorToValue", () => {
  test("any", () => {
    type Compiled = ValidatorToValue<VAny>;

    expectTypeOf<Compiled>().toEqualTypeOf<any>();
  });

  test("string", () => {
    type Compiled = ValidatorToValue<VString>;

    expectTypeOf<Compiled>().toEqualTypeOf<string>();
  });

  test("float64", () => {
    type Compiled = ValidatorToValue<VFloat64>;

    expectTypeOf<Compiled>().toEqualTypeOf<number>();
  });

  test("int64", () => {
    type Compiled = ValidatorToValue<VInt64>;

    expectTypeOf<Compiled>().toEqualTypeOf<bigint>();
  });

  test("boolean", () => {
    type Compiled = ValidatorToValue<VBoolean>;

    expectTypeOf<Compiled>().toEqualTypeOf<boolean>();
  });

  test("null", () => {
    type Compiled = ValidatorToValue<VNull>;

    expectTypeOf<Compiled>().toEqualTypeOf<null>();
  });

  test("bytes", () => {
    type Compiled = ValidatorToValue<VBytes>;

    expectTypeOf<Compiled>().toEqualTypeOf<ArrayBuffer>();
  });

  describe("literal", () => {
    test("string literal", () => {
      type Compiled = ValidatorToValue<VLiteral<"foo">>;

      expectTypeOf<Compiled>().toEqualTypeOf<"foo">();
    });

    test("number literal", () => {
      type Compiled = ValidatorToValue<VLiteral<42>>;

      expectTypeOf<Compiled>().toEqualTypeOf<42>();
    });

    test("boolean literal", () => {
      type Compiled = ValidatorToValue<VLiteral<true>>;

      expectTypeOf<Compiled>().toEqualTypeOf<true>();
    });

    test("bigint literal", () => {
      type Compiled = ValidatorToValue<VLiteral<1n>>;

      expectTypeOf<Compiled>().toEqualTypeOf<1n>();
    });
  });

  test("id", () => {
    type Compiled = ValidatorToValue<VId<GenericId<"users">>>;

    expectTypeOf<Compiled>().toEqualTypeOf<GenericId<"users">>();
  });

  describe("array", () => {
    test("string[]", () => {
      type Compiled = ValidatorToValue<VArray<string[], VString>>;

      expectTypeOf<Compiled>().toEqualTypeOf<string[]>();
    });

    test("number[]", () => {
      type Compiled = ValidatorToValue<VArray<number[], VFloat64>>;

      expectTypeOf<Compiled>().toEqualTypeOf<number[]>();
    });

    test("string[][]", () => {
      type Compiled = ValidatorToValue<
        VArray<string[][], VArray<string[], VString>>
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<string[][]>();
    });
  });

  describe("object", () => {
    test("empty object", () => {
      type Compiled = ValidatorToValue<VObject<{}, {}>>;

      expectTypeOf<Compiled>().toEqualTypeOf<{}>();
    });

    test("simple object", () => {
      type Compiled = ValidatorToValue<
        VObject<{ foo: string }, { foo: VString }>
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<{ foo: string }>();
    });

    test("object with optional field", () => {
      type Compiled = ValidatorToValue<
        VObject<
          { foo?: string },
          { foo: VString<string | undefined, "optional"> }
        >
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<{ foo?: string }>();
    });

    test("nested object", () => {
      type Compiled = ValidatorToValue<
        VObject<
          { foo: { bar: number } },
          { foo: VObject<{ bar: number }, { bar: VFloat64 }> }
        >
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<{ foo: { bar: number } }>();
    });
  });

  describe("union", () => {
    test("string | number", () => {
      type Compiled = ValidatorToValue<VUnion<string | number, [VString, VFloat64]>>;

      expectTypeOf<Compiled>().toEqualTypeOf<string | number>();
    });

    test("literal union", () => {
      type Compiled = ValidatorToValue<
        VUnion<"admin" | "user", [VLiteral<"admin">, VLiteral<"user">]>
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<"admin" | "user">();
    });
  });

  describe("record", () => {
    test("Record<string, number>", () => {
      type Compiled = ValidatorToValue<
        VRecord<Record<string, number>, VString, VFloat64>
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<Record<string, number>>();
    });
  });

  describe("optional", () => {
    test("optional string in object", () => {
      type Compiled = ValidatorToValue<
        VObject<
          { userId?: GenericId<"users"> },
          { userId: VId<GenericId<"users"> | undefined, "optional"> }
        >
      >;

      expectTypeOf<Compiled>().toEqualTypeOf<{
        userId?: GenericId<"users">;
      }>();
    });
  });

  describe("typeof v.* validators", () => {
    test("typeof v.string()", () => {
      const _v = v.string();
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<string>();
    });

    test("typeof v.object({ foo: v.string() })", () => {
      const _v = v.object({ foo: v.string() });
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<{ foo: string }>();
    });

    test("typeof v.object({ foo: v.optional(v.string()) })", () => {
      const _v = v.object({ foo: v.optional(v.string()) });
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<{ foo?: string }>();
    });

    test("typeof v.array(v.string())", () => {
      const _v = v.array(v.string());
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<string[]>();
    });

    test("typeof v.union(v.string(), v.float64())", () => {
      const _v = v.union(v.string(), v.float64());
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<string | number>();
    });

    test("typeof v.record(v.string(), v.float64())", () => {
      const _v = v.record(v.string(), v.float64());
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<Record<string, number>>();
    });

    test("typeof v.id('users')", () => {
      const _v = v.id("users");
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<GenericId<"users">>();
    });

    test("typeof v.literal('foo')", () => {
      const _v = v.literal("foo");
      type Compiled = ValidatorToValue<typeof _v>;

      expectTypeOf<Compiled>().toEqualTypeOf<"foo">();
    });
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

describe(compilePropertyValidators, () => {
  test("simple property validators", () => {
    const propertyValidators = {
      foo: v.string(),
      bar: v.float64(),
    };
    const compiledSchema = compilePropertyValidators(propertyValidators);
    const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

    expect(roundtripped).toStrictEqual(v.object(propertyValidators));
  });

  test("property validators with optional fields", () => {
    const propertyValidators = {
      foo: v.string(),
      bar: v.optional(v.float64()),
    };
    const compiledSchema = compilePropertyValidators(propertyValidators);
    const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

    expect(roundtripped).toStrictEqual(v.object(propertyValidators));
  });

  test("property validators with nested objects", () => {
    const propertyValidators = {
      name: v.string(),
      address: v.object({
        street: v.string(),
        city: v.string(),
      }),
    };
    const compiledSchema = compilePropertyValidators(propertyValidators);
    const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

    expect(roundtripped).toStrictEqual(v.object(propertyValidators));
  });

  test("property validators with optional id", () => {
    const propertyValidators = {
      text: v.string(),
      userId: v.optional(v.id("users")),
    };
    const compiledSchema = compilePropertyValidators(propertyValidators);
    const roundtripped = compileSchema(compiledSchema as Schema.Schema<any>);

    expect(roundtripped).toStrictEqual(v.object(propertyValidators));
  });
});
