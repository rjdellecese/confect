import { describe, effect, expect, expectTypeOf, test } from "@effect/vitest";
import { type VBoolean, type VString, type VUnion, v } from "convex/values";
import { Effect, Exit, identity, Schema } from "effect";

import {
  compileArgsSchema,
  compileAst,
  compileSchema,
  compileTableSchema,
  EmptyTupleIsNotSupportedError,
  IndexSignaturesAreNotSupportedError,
  OptionalTupleElementsAreNotSupportedError,
  TopLevelMustBeObjectError,
  TopLevelMustBeObjectOrUnionError,
  UnsupportedPropertySignatureKeyTypeError,
  UnsupportedSchemaTypeError,
  type ValueToValidator,
} from "../src/server/schema_to_validator";
import { GenericId } from "../src/server/schemas/GenericId";

describe(compileAst, () => {
  describe("allowed", () => {
    effect("any", () =>
      Effect.gen(function* () {
        const schema = Schema.Any;
        const validator = v.any();
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("literal", () =>
      Effect.gen(function* () {
        const schema = Schema.Literal("LiteralString");
        const validator = v.literal("LiteralString");
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("literal union", () =>
      Effect.gen(function* () {
        const schema = Schema.Literal("LiteralString", 1);
        const validator = v.union(v.literal("LiteralString"), v.literal(1));
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("boolean", () =>
      Effect.gen(function* () {
        const schema = Schema.Boolean;
        const validator = v.boolean();
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("string", () =>
      Effect.gen(function* () {
        const schema = Schema.String;
        const validator = v.string();
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("number", () =>
      Effect.gen(function* () {
        const schema = Schema.Number;
        const validator = v.float64();
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("empty object", () =>
      Effect.gen(function* () {
        const schema = Schema.Struct({});
        const validator = v.object({});
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("simple object", () =>
      Effect.gen(function* () {
        const schema = Schema.Struct({
          foo: Schema.String,
          bar: Schema.Number,
        });
        const validator = v.object({ foo: v.string(), bar: v.float64() });
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("object with optional field (exact)", () =>
      Effect.gen(function* () {
        const schema = Schema.Struct({
          foo: Schema.optionalWith(Schema.String, { exact: true }),
        });

        const validator = v.object({ foo: v.optional(v.string()) });
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("object with optional field", () =>
      Effect.gen(function* () {
        const schema = Schema.Struct({
          foo: Schema.optional(Schema.String),
        });

        const validator = v.object({ foo: v.optional(v.string()) });
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("nested objects", () =>
      Effect.gen(function* () {
        const schema = Schema.Struct({
          foo: Schema.Struct({
            bar: Schema.Struct({
              baz: Schema.String,
            }),
          }),
        });
        const validator = v.object({
          foo: v.object({ bar: v.object({ baz: v.string() }) }),
        });
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("union with four elements", () =>
      Effect.gen(function* () {
        const schema = Schema.Union(
          Schema.String,
          Schema.Number,
          Schema.Boolean,
          Schema.Struct({}),
        );
        const validator = v.union(
          v.string(),
          v.float64(),
          v.boolean(),
          v.object({}),
        );
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("tuple with one element", () =>
      Effect.gen(function* () {
        const schema = Schema.Tuple(Schema.String);
        const validator = v.array(v.string());
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("tuple with two elements", () =>
      Effect.gen(function* () {
        const schema = Schema.Tuple(Schema.String, Schema.Number);
        const validator = v.array(v.union(v.string(), v.float64()));
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(validator);
      }),
    );

    effect("tuple with three elements", () =>
      Effect.gen(function* () {
        const schema = Schema.Tuple(
          Schema.String,
          Schema.Number,
          Schema.Boolean,
        );
        const expectedValidator = v.array(
          v.union(v.string(), v.float64(), v.boolean()),
        );
        const compiledValidator = yield* compileAst(
          Schema.encodedSchema(schema).ast,
        );

        expect(compiledValidator).toStrictEqual(expectedValidator);
      }),
    );

    describe("suspend", () => {
      effect("object with optional recursive field", () =>
        Effect.gen(function* () {
          type Foo = {
            foo?: Foo;
          };

          const Foo = Schema.Struct({
            foo: Schema.suspend((): Schema.Schema<Foo> => Foo).pipe(
              Schema.optional,
            ),
          });

          const expectedValidator = v.any();
          const compiledValidator = yield* compileAst(
            Schema.encodedSchema(Foo).ast,
          );

          expect(compiledValidator).toStrictEqual(expectedValidator);
        }),
      );

      effect("tuple with required recursive element", () =>
        Effect.gen(function* () {
          type Foo = {
            foo: Foo;
          };
          const Foo = Schema.Struct({
            foo: Schema.suspend((): Schema.Schema<Foo> => Foo),
          });

          const expectedValidator = v.any();
          const compiledValidator = yield* compileAst(
            Schema.encodedSchema(Foo).ast,
          );

          expect(compiledValidator).toStrictEqual(expectedValidator);
        }),
      );

      effect("array with recursive element", () =>
        Effect.gen(function* () {
          type Foo = readonly Foo[];
          const Foo = Schema.Array(
            Schema.suspend((): Schema.Schema<Foo> => Foo),
          );

          const expectedValidator = v.any();
          const compiledValidator = yield* compileAst(
            Schema.encodedSchema(Foo).ast,
          );

          expect(compiledValidator).toStrictEqual(expectedValidator);
        }),
      );

      effect("tuple with recursive element", () =>
        Effect.gen(function* () {
          type Foo = readonly [string, Foo];
          const Foo = Schema.Tuple(
            Schema.String,
            Schema.suspend((): Schema.Schema<Foo> => Foo),
          );

          const expectedValidator = v.any();
          const compiledValidator = yield* compileAst(
            Schema.encodedSchema(Foo).ast,
          );

          expect(compiledValidator).toStrictEqual(expectedValidator);
        }),
      );

      effect("union with recursive element", () =>
        Effect.gen(function* () {
          type Foo = {
            foos: readonly Foo[];
          } | null;
          const Foo = Schema.Union(
            Schema.Struct({
              foos: Schema.Array(Schema.suspend((): Schema.Schema<Foo> => Foo)),
            }),
            Schema.Null,
          );

          const expectedValidator = v.any();
          const compiledValidator = yield* compileAst(
            Schema.encodedSchema(Foo).ast,
          );

          expect(compiledValidator).toStrictEqual(expectedValidator);
        }),
      );
    });
  });

  describe("disallowed", () => {
    effect("object with number keys", () =>
      Effect.gen(function* () {
        const numberKey = 100;

        const schema = Schema.Struct({
          [numberKey]: Schema.String,
        });

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(
            new UnsupportedPropertySignatureKeyTypeError({
              propertyKey: numberKey,
            }),
          ),
        );
      }),
    );

    effect("object with symbol keys", () =>
      Effect.gen(function* () {
        const symbolKey = Symbol("SymbolKey");

        const schema = Schema.Struct({
          [symbolKey]: Schema.Number,
        });

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(
            new UnsupportedPropertySignatureKeyTypeError({
              propertyKey: symbolKey,
            }),
          ),
        );
      }),
    );

    effect("union of string and undefined", () =>
      Effect.gen(function* () {
        const schema = Schema.Union(Schema.String, Schema.Undefined);

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(
            new UnsupportedSchemaTypeError({ schemaType: "UndefinedKeyword" }),
          ),
        );
      }),
    );

    effect("object with property of union of string and undefined", () =>
      Effect.gen(function* () {
        const schema = Schema.Struct({
          foo: Schema.Union(Schema.String, Schema.Undefined),
        });

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(
            new UnsupportedSchemaTypeError({ schemaType: "UndefinedKeyword" }),
          ),
        );
      }),
    );

    effect("empty tuple", () =>
      Effect.gen(function* () {
        const schema = Schema.Tuple();

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(new EmptyTupleIsNotSupportedError()),
        );
      }),
    );

    effect("tuple with an optional element", () =>
      Effect.gen(function* () {
        const schema = Schema.Tuple(Schema.optionalElement(Schema.String));

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(new OptionalTupleElementsAreNotSupportedError()),
        );
      }),
    );

    effect("unsupported keyword", () =>
      Effect.gen(function* () {
        const schema = Schema.Undefined;

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(
            new UnsupportedSchemaTypeError({ schemaType: "UndefinedKeyword" }),
          ),
        );
      }),
    );

    effect("unsupported declaration", () =>
      Effect.gen(function* () {
        class Klass {}

        const schema = Schema.instanceOf(Klass);

        const exit = yield* Effect.exit(
          compileAst(Schema.encodedSchema(schema).ast),
        );

        expect(exit).toStrictEqual(
          Exit.fail(
            new UnsupportedSchemaTypeError({ schemaType: "Declaration" }),
          ),
        );
      }),
    );
  });
});

describe(compileSchema, () => {
  test("any", () => {
    const expectedValidator = v.any();

    const schema = Schema.Any;
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("literal", () => {
    const expectedValidator = v.literal("LiteralString");

    const schema = Schema.Literal("LiteralString");
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
  });

  test("id", () => {
    const expectedValidator = v.id("users");

    const schema = GenericId("users");
    const compiledValidator = compileSchema(schema);

    expect(compiledValidator).toStrictEqual(expectedValidator);
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

  test("branded string", () => {
    const expectedValidator = v.string();

    const schema = Schema.String.pipe(Schema.brand("BrandedString"));
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

  test("array buffer", () => {
    const expectedValidator = v.bytes();

    const schema = Schema.instanceOf(ArrayBuffer);
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
      foo: Schema.optional(Schema.String),
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

  describe("refinements", () => {
    test("int", () => {
      const expectedValidator = v.number();
      type ExpectedValidator = typeof expectedValidator;

      const compiledValidator = compileSchema(Schema.Int);
      type CompiledValidator = typeof compiledValidator;

      expect(compiledValidator).toStrictEqual(expectedValidator);
      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("filter", () => {
      const expectedValidator = v.string();
      type ExpectedValidator = typeof expectedValidator;

      const compiledValidator = compileSchema(
        Schema.String.pipe(Schema.filter((s) => s.length > 1)),
      );
      type CompiledValidator = typeof compiledValidator;

      expect(compiledValidator).toStrictEqual(expectedValidator);
      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    describe("record", () => {
      test("simple record", () => {
        const expectedValidator = v.record(v.string(), v.number());
        type ExpectedValidator = typeof expectedValidator;

        const compiledValidator = compileSchema(
          Schema.Record({
            key: Schema.String,
            value: Schema.Number,
          }),
        );
        type CompiledValidator = typeof compiledValidator;

        expect(compiledValidator).toStrictEqual(expectedValidator);
        expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
      });

      test("struct with index signatures", () => {
        const schema = Schema.Struct(
          {
            foo: Schema.String,
          },
          { key: Schema.String, value: Schema.Number },
        );

        expect(() => compileSchema(schema)).toThrow(
          new IndexSignaturesAreNotSupportedError(),
        );
      });
    });
  });
});

describe("suspend", () => {
  test("object with optional recursive field", () => {
    const expectedValidator = v.any();
    type ExpectedValidator = typeof expectedValidator;

    type foo = {
      foo?: foo;
    };
    const Foo = Schema.Struct({
      foo: Schema.suspend((): Schema.Schema<foo> => Foo).pipe(Schema.optional),
    });
    const compiledValidator = compileSchema(Foo);
    type CompiledValidator = typeof compiledValidator;

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf<CompiledValidator>().toExtend<ExpectedValidator>();
  });

  test("object with required recursive field", () => {
    const expectedValidator = v.any();
    type ExpectedValidator = typeof expectedValidator;

    type Foo = {
      foo: Foo;
    };
    const Foo = Schema.Struct({
      foo: Schema.suspend((): Schema.Schema<Foo> => Foo),
    });
    const compiledValidator = compileSchema(Foo);
    type CompiledValidator = typeof compiledValidator;

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf<CompiledValidator>().toExtend<ExpectedValidator>();
  });

  test("array with recursive element", () => {
    const expectedValidator = v.any();
    type ExpectedValidator = typeof expectedValidator;

    type Foo = readonly Foo[];
    const Foo = Schema.Array(Schema.suspend((): Schema.Schema<Foo> => Foo));
    const compiledValidator = compileSchema(Foo);
    type CompiledValidator = typeof compiledValidator;

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf<CompiledValidator>().toExtend<ExpectedValidator>();
  });

  test("tuple with recursive element", () => {
    const expectedValidator = v.any();
    type ExpectedValidator = typeof expectedValidator;

    type Foo = readonly [Foo, string];
    const Foo = Schema.Tuple(
      Schema.suspend((): Schema.Schema<Foo> => Foo),
      Schema.String,
    );
    const compiledValidator = compileSchema(Foo);
    type CompiledValidator = typeof compiledValidator;

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf<CompiledValidator>().toExtend<ExpectedValidator>();
  });

  test("union with recursive element", () => {
    const expectedValidator = v.any();
    type ExpectedValidator = typeof expectedValidator;

    type Foo = {
      foos: readonly Foo[];
    } | null;
    const Foo = Schema.Union(
      Schema.Struct({
        foos: Schema.Array(Schema.suspend((): Schema.Schema<Foo> => Foo)),
      }),
      Schema.Null,
    );
    const compiledValidator = compileSchema(Foo);
    type CompiledValidator = typeof compiledValidator;

    expect(compiledValidator).toStrictEqual(expectedValidator);
    expectTypeOf<CompiledValidator>().toExtend<ExpectedValidator>();
  });
});

describe("ValueToValidator", () => {
  test("any", () => {
    const _expectedValidator = v.any();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<any>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("never", () => {
    type CompiledValidator = ValueToValidator<never>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<never>();
  });

  test("id", () => {
    const _expectedValidator = v.id("users");
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<GenericId<"users">>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("null", () => {
    const _expectedValidator = v.null();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<null>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("boolean", () => {
    const _expectedValidator = v.boolean();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<boolean>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("true | false", () => {
    const _expectedValidator = v.boolean();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<true | false>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("true | false | string", () => {
    const _validator = v.union(v.boolean(), v.string());
    type Validator = typeof _validator;

    // The order of the union elements is not guaranteed, so we need to check
    // that the compiled validator matches any permutation of the original validator.
    type AnyPermutationOfValidator =
      | VUnion<
          string | boolean,
          [VBoolean<boolean, "required">, VString<string, "required">],
          "required",
          never
        >
      | VUnion<
          string | boolean,
          [VString<string, "required">, VBoolean<boolean, "required">],
          "required",
          never
        >
      | VUnion<
          boolean | string,
          [VBoolean<boolean, "required">, VString<string, "required">],
          "required",
          never
        >
      | VUnion<
          boolean | string,
          [VString<string, "required">, VBoolean<boolean, "required">],
          "required",
          never
        >;
    expectTypeOf<Validator>().toExtend<AnyPermutationOfValidator>();

    type CompiledValidator = ValueToValidator<true | false | string>;

    expectTypeOf<CompiledValidator>().toExtend<AnyPermutationOfValidator>();
  });

  test("number", () => {
    const _expectedValidator = v.float64();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<number>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("bigint", () => {
    const _expectedValidator = v.int64();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<bigint>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("string", () => {
    const _expectedValidator = v.string();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<string>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  test("bytes", () => {
    const _expectedValidator = v.bytes();
    type ExpectedValidator = typeof _expectedValidator;

    type CompiledValidator = ValueToValidator<ArrayBuffer>;

    expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
  });

  describe("literal", () => {
    test("string", () => {
      const _expectedValidator = v.literal("foo");
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<"foo">;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("number", () => {
      const _expectedValidator = v.literal(1);
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<1>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("boolean", () => {
      const _expectedValidator = v.literal(true);
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<true>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("bigint", () => {
      const _expectedValidator = v.literal(1n);
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<1n>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });

  describe("array", () => {
    test("string[]", () => {
      const _expectedValidator = v.array(v.string());
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<string[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("number[]", () => {
      const _expectedValidator = v.array(v.float64());
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<number[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("'foo'[]", () => {
      const _expectedValidator = v.array(v.literal("foo"));
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<"foo"[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("string[][]", () => {
      const _expectedValidator = v.array(v.array(v.string()));
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<string[][]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("any[]", () => {
      const _expectedValidator = v.array(v.any());
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<any[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("type NestedArray = (string | NestedArray)[]", () => {
      const _expectedValidator = v.any();
      type ExpectedValidator = typeof _expectedValidator;

      type NestedArray = (string | NestedArray)[];
      type CompiledValidator = ValueToValidator<NestedArray>;

      expectTypeOf<CompiledValidator>().toExtend<ExpectedValidator>();
    });
  });

  describe("object", () => {
    test("{}", () => {
      const _expectedValidator = v.object({});
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{}>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: string }", () => {
      const _expectedValidator = v.object({ foo: v.string() });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo: string }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: { bar: number } }", () => {
      const _expectedValidator = v.object({
        foo: v.object({ bar: v.float64() }),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo: { bar: number };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: { bar?: number | undefined } }", () => {
      const _expectedValidator = v.object({
        foo: v.object({ bar: v.optional(v.float64()) }),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo: { bar?: number | undefined };
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar: number } | undefined }", () => {
      const _expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.float64() })),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar: number } | undefined;
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: string | undefined }", () => {
      const _expectedValidator = v.object({
        foo: v.optional(v.string()),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo?: string | undefined }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: string | undefined }", () => {
      const _expectedValidator = v.object({
        foo: v.optional(v.string()),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo?: string | undefined }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar?: number | undefined } | undefined }", () => {
      const _expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar?: number | undefined } | undefined;
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: { bar?: number | undefined } | undefined }", () => {
      const _expectedValidator = v.object({
        foo: v.optional(v.object({ bar: v.optional(v.float64()) })),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{
        foo?: { bar?: number | undefined } | undefined;
      }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo?: any }", () => {
      const _expectedValidator = v.object({ foo: v.optional(v.any()) });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo?: any }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: any }", () => {
      const _expectedValidator = v.object({ foo: v.any() });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo: any }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("{ foo: { bar: any } }", () => {
      const _expectedValidator = v.object({
        foo: v.object({ bar: v.array(v.any()) }),
      });
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<{ foo: { bar: any[] } }>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });

  describe("union", () => {
    test("string | number | boolean[]", () => {
      const _expectedValidator = v.union(
        v.string(),
        v.float64(),
        v.array(v.boolean()),
      );
      type ExpectedValidator = typeof _expectedValidator;

      type CompiledValidator = ValueToValidator<string | number | boolean[]>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });

  describe("recursive", () => {
    test("type Foo = { foo: Foo }", () => {
      const _expectedValidator = v.any();
      type ExpectedValidator = typeof _expectedValidator;

      type Foo = { foo: Foo };
      type CompiledValidator = ValueToValidator<Foo>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("type Foo = { foo?: Foo }", () => {
      const _expectedValidator = v.any();
      type ExpectedValidator = typeof _expectedValidator;

      type Foo = { foo?: Foo };
      type CompiledValidator = ValueToValidator<Foo>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("type Foo = Foo[]", () => {
      const _expectedValidator = v.any();
      type ExpectedValidator = typeof _expectedValidator;

      type Foo = Foo[];
      type CompiledValidator = ValueToValidator<Foo>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("type Foo = [string, Foo]", () => {
      const _expectedValidator = v.any();
      type ExpectedValidator = typeof _expectedValidator;

      type Foo = [string, Foo];
      type CompiledValidator = ValueToValidator<Foo>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });

    test("type Foo = { foos: Foo[] } | null", () => {
      const _expectedValidator = v.any();
      type ExpectedValidator = typeof _expectedValidator;

      type Foo = { foos: Foo[] } | null;
      type CompiledValidator = ValueToValidator<Foo>;

      expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
    });
  });
});

describe(compileTableSchema, () => {
  test("succeeds if provided Schema is a Struct", () => {
    const compiledValidator = compileTableSchema(
      Schema.Struct({
        foo: Schema.String,
        bar: Schema.optional(Schema.Struct({ bar: Schema.Number })),
      }),
    );

    const expectedValidator = v.object({
      foo: v.string(),
      bar: v.optional(v.object({ bar: v.float64() })),
    });

    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
    expect(compiledValidator).toStrictEqual(expectedValidator);
  });

  test("succeeds if provided Schema is a Union", () => {
    const compiledValidator = compileTableSchema(
      Schema.Union(Schema.String, Schema.Number),
    );

    const expectedValidator = v.union(v.string(), v.number());

    expectTypeOf(compiledValidator).toEqualTypeOf(expectedValidator);
    expect(compiledValidator).toStrictEqual(expectedValidator);
  });

  test("fails if provided Schema is neither a Struct nor a Union", () => {
    const stringSchema = Schema.String;

    expect(() => compileTableSchema(stringSchema)).toThrow(
      new TopLevelMustBeObjectOrUnionError(),
    );
  });

  test("fails if provided Schema requires context", () => {
    expectTypeOf<Schema.Schema.AnyNoContext & Schema.Struct<any>>().toExtend<
      Parameters<typeof compileTableSchema>[0]
    >();

    expectTypeOf<
      Schema.Schema<any, any, "Dep"> & Schema.Struct<any>
    >().not.toExtend<Parameters<typeof compileTableSchema>[0]>();
  });

  test("fails if provided Schema contains index signatures", () => {
    const structWithIndexSignatures = Schema.Struct(
      { foo: Schema.String },
      { key: Schema.String, value: Schema.String },
    );

    expect(() => compileTableSchema(structWithIndexSignatures)).toThrow(
      new IndexSignaturesAreNotSupportedError(),
    );
  });

  effect("fails if provided Schema is not a Struct or a Union", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.try({
        try: () => compileTableSchema(Schema.String),
        catch: identity,
      }).pipe(Effect.exit);

      expect(exit).toStrictEqual(
        Exit.fail(new TopLevelMustBeObjectOrUnionError()),
      );
    }),
  );
});

describe(compileArgsSchema, () => {
  test("extracts the wrapping schema and returns the object", () => {
    const compiledArgsValidator = compileArgsSchema(
      Schema.Struct({
        foo: Schema.String,
        bar: Schema.optional(Schema.Number),
      }),
    );
    const expectedArgsValidator = {
      foo: v.string(),
      bar: v.optional(v.number()),
    };

    expect(compiledArgsValidator).toStrictEqual(expectedArgsValidator);
  });

  effect("fails if provided Schema contains index signatures", () =>
    Effect.gen(function* () {
      const structWithIndexSignatures = Schema.Struct(
        { foo: Schema.String },
        { key: Schema.String, value: Schema.String },
      );

      const exit = yield* Effect.try({
        try: () => compileArgsSchema(structWithIndexSignatures),
        catch: identity,
      }).pipe(Effect.exit);

      expect(exit).toStrictEqual(
        Exit.fail(new IndexSignaturesAreNotSupportedError()),
      );
    }),
  );

  effect("fails if provided Schema is not a Struct", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.try({
        try: () => compileArgsSchema(Schema.String),
        catch: identity,
      }).pipe(Effect.exit);

      expect(exit).toStrictEqual(Exit.fail(new TopLevelMustBeObjectError()));
    }),
  );
});
