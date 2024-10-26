import {
	type GenericId,
	type VBoolean,
	type VString,
	type VUnion,
	v,
} from "convex/values";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Id } from "~/src/server";
import {
	EmptyTupleIsNotSupportedError,
	IndexSignaturesAreNotSupportedError,
	OptionalTupleElementsAreNotSupportedError,
	TopLevelMustBeObjectError,
	TopLevelMustBeObjectOrUnionError,
	UnsupportedPropertySignatureKeyTypeError,
	UnsupportedSchemaTypeError,
	type ValueToValidator,
	compileArgsSchema,
	compileAst,
	compileSchema,
	compileTableSchema,
} from "~/src/server/schema-to-validator";

describe(compileAst, () => {
	describe("allowed", () => {
		test("any", () => {
			const schema = Schema.Any;
			const validator = v.any();
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("literal", () => {
			const schema = Schema.Literal("LiteralString");
			const validator = v.literal("LiteralString");
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("literal union", () => {
			const schema = Schema.Literal("LiteralString", 1);
			const validator = v.union(v.literal("LiteralString"), v.literal(1));
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("boolean", () => {
			const schema = Schema.Boolean;
			const validator = v.boolean();
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("string", () => {
			const schema = Schema.String;
			const validator = v.string();
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("number", () => {
			const schema = Schema.Number;
			const validator = v.float64();
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("empty object", () => {
			const schema = Schema.Struct({});
			const validator = v.object({});
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("simple object", () => {
			const schema = Schema.Struct({ foo: Schema.String, bar: Schema.Number });
			const validator = v.object({ foo: v.string(), bar: v.float64() });
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("object with optional field", () => {
			const schema = Schema.Struct({
				foo: Schema.optionalWith(Schema.String, { exact: true }),
			});

			const validator = v.object({ foo: v.optional(v.string()) });
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("object with optional field (exact)", () => {
			const schema = Schema.Struct({
				foo: Schema.optional(Schema.String),
			});

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new UnsupportedSchemaTypeError({ schemaType: "UndefinedKeyword" }),
			);
		});

		test("nested objects", () => {
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
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("union with four elements", () => {
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
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("tuple with one element", () => {
			const schema = Schema.Tuple(Schema.String);
			const validator = v.array(v.string());
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("tuple with two elements", () => {
			const schema = Schema.Tuple(Schema.String, Schema.Number);
			const validator = v.array(v.union(v.string(), v.float64()));
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(validator);
		});

		test("tuple with three elements", () => {
			const schema = Schema.Tuple(Schema.String, Schema.Number, Schema.Boolean);
			const expectedValidator = v.array(
				v.union(v.string(), v.float64(), v.boolean()),
			);
			const compiledValidator = compileAst(Schema.encodedSchema(schema).ast);

			expect(compiledValidator).toStrictEqual(expectedValidator);
		});
	});

	describe("disallowed", () => {
		test("object with number keys", () => {
			const numberKey = 100;

			const schema = Schema.Struct({
				[numberKey]: Schema.String,
			});

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new UnsupportedPropertySignatureKeyTypeError({
					propertyKey: numberKey,
				}),
			);
		});

		test("object with symbol keys", () => {
			const symbolKey = Symbol("SymbolKey");

			const schema = Schema.Struct({
				[symbolKey]: Schema.Number,
			});

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new UnsupportedPropertySignatureKeyTypeError({
					propertyKey: symbolKey,
				}),
			);
		});

		test("empty tuple", () => {
			const schema = Schema.Tuple();

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new EmptyTupleIsNotSupportedError(),
			);
		});

		test("tuple with an optional element", () => {
			const schema = Schema.Tuple(Schema.optionalElement(Schema.String));

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new OptionalTupleElementsAreNotSupportedError(),
			);
		});

		test("unsupported keyword", () => {
			const schema = Schema.Undefined;

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new UnsupportedSchemaTypeError({ schemaType: "UndefinedKeyword" }),
			);
		});

		test("unsupported declaration", () => {
			class Klass {}

			const schema = Schema.instanceOf(Klass);

			expect(() => compileAst(Schema.encodedSchema(schema).ast)).toThrow(
				new UnsupportedSchemaTypeError({ schemaType: "Declaration" }),
			);
		});
	});
});

describe(compileSchema, () => {
	test("any", () => {
		const expectedValidator = v.any();

		const schema = Schema.Any;
		const compiledValidator = compileSchema(schema);

		expect(compiledValidator).toStrictEqual(expectedValidator);
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

		const schema = Id.Id("users");
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
			foo: Schema.optionalWith(Schema.String, { exact: true }),
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
});

describe("ValueToValidator", () => {
	test("any", () => {
		const expectedValidator = v.any();
		type ExpectedValidator = typeof expectedValidator;

		type CompiledValidator = ValueToValidator<any>;

		expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
	});

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

	test("true | false", () => {
		const expectedValidator = v.boolean();
		type ExpectedValidator = typeof expectedValidator;

		type CompiledValidator = ValueToValidator<true | false>;

		expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
	});

	test("true | false | string", () => {
		const validator = v.union(v.boolean(), v.string());
		type Validator = typeof validator;

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
		expectTypeOf<Validator>().toMatchTypeOf<AnyPermutationOfValidator>();

		type CompiledValidator = ValueToValidator<true | false | string>;

		expectTypeOf<CompiledValidator>().toMatchTypeOf<AnyPermutationOfValidator>();
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

		test("any[]", () => {
			const expectedValidator = v.array(v.any());
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<any[]>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});

		test("any[][]", () => {
			const expectedValidator = v.array(v.array(v.any()));
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<any[][]>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});
	});

	describe("object", () => {
		test("{}", () => {
			const expectedValidator = v.object({});
			type ExpectedValidator = typeof expectedValidator;

			// biome-ignore lint/complexity/noBannedTypes:
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

		test("{ foo: { bar?: number | undefined } }", () => {
			const expectedValidator = v.object({
				foo: v.object({ bar: v.optional(v.float64()) }),
			});
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<{
				foo: { bar?: number | undefined };
			}>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});

		test("{ foo?: { bar: number } | undefined }", () => {
			const expectedValidator = v.object({
				foo: v.optional(v.object({ bar: v.float64() })),
			});
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<{
				foo?: { bar: number } | undefined;
			}>;

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

		test("{ foo?: string | undefined }", () => {
			const expectedValidator = v.object({
				foo: v.optional(v.string()),
			});
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<{ foo?: string | undefined }>;

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

		test("{ foo?: any }", () => {
			const expectedValidator = v.object({ foo: v.optional(v.any()) });
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<{ foo?: any }>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});

		test("{ foo: any }", () => {
			const expectedValidator = v.object({ foo: v.any() });
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<{ foo: any }>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});

		test("{ foo: { bar: any } }", () => {
			const expectedValidator = v.object({
				foo: v.object({ bar: v.array(v.any()) }),
			});
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<{ foo: { bar: any[] } }>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});
	});

	describe("union", () => {
		test("string | number | boolean[]", () => {
			const expectedValidator = v.union(
				v.string(),
				v.float64(),
				v.array(v.boolean()),
			);
			type ExpectedValidator = typeof expectedValidator;

			type CompiledValidator = ValueToValidator<string | number | boolean[]>;

			expectTypeOf<CompiledValidator>().toEqualTypeOf<ExpectedValidator>();
		});
	});
});

describe(compileTableSchema, () => {
	test("succeeds if provided Schema is a Struct", () => {
		const compiledValidator = compileTableSchema(
			Schema.Struct({
				foo: Schema.String,
				bar: Schema.optionalWith(Schema.Struct({ bar: Schema.Number }), {
					exact: true,
				}),
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
		expectTypeOf<
			Schema.Schema.AnyNoContext & Schema.Struct<any>
		>().toMatchTypeOf<Parameters<typeof compileTableSchema>[0]>();

		expectTypeOf<
			Schema.Schema<any, any, "Dep"> & Schema.Struct<any>
		>().not.toMatchTypeOf<Parameters<typeof compileTableSchema>[0]>();
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

	test("fails if provided Schema is not a Struct or a Union", () => {
		expect(() => compileTableSchema(Schema.String)).toThrow(
			new TopLevelMustBeObjectOrUnionError(),
		);
	});
});

describe(compileArgsSchema, () => {
	test("extracts the wrapping schema and returns the object", () => {
		const compiledArgsValidator = compileArgsSchema(
			Schema.Struct({
				foo: Schema.String,
				bar: Schema.optionalWith(Schema.Number, { exact: true }),
			}),
		);
		const expectedArgsValidator = {
			foo: v.string(),
			bar: v.optional(v.number()),
		};

		expect(compiledArgsValidator).toStrictEqual(expectedArgsValidator);
	});

	test("fails if provided Schema contains index signatures", () => {
		const structWithIndexSignatures = Schema.Struct(
			{ foo: Schema.String },
			{ key: Schema.String, value: Schema.String },
		);

		expect(() => compileArgsSchema(structWithIndexSignatures)).toThrow(
			new IndexSignaturesAreNotSupportedError(),
		);
	});

	test("fails if provided Schema is not a Struct", () => {
		expect(() => compileArgsSchema(Schema.String)).toThrow(
			new TopLevelMustBeObjectError(),
		);
	});
});
