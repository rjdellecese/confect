import type { AST } from "@effect/schema";
import * as Schema from "@effect/schema/Schema";
import type {
	GenericId,
	OptionalProperty,
	PropertyValidators,
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
	VOptional,
	VString,
	VUnion,
	Validator,
} from "convex/values";
import { type Value, v } from "convex/values";
import { Array, Data, Effect, Match, Option, pipe } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import type { WritableDeep } from "type-fest";

import type {
	IsAny,
	IsOptional,
	IsUnion,
	IsValueLiteral,
	UnionToTuple,
} from "~/src/type-utils";

// Args

export const args = <DatabaseValue, TypeScriptValue = DatabaseValue>(
	schema: Schema.Schema<TypeScriptValue, DatabaseValue>,
): PropertyValidators => goTopArgs(Schema.encodedSchema(schema).ast);

const goTopArgs = (ast: AST.AST): PropertyValidators =>
	pipe(
		ast,
		Match.value,
		Match.tag("TypeLiteral", ({ indexSignatures, propertySignatures }) =>
			Array.isEmptyReadonlyArray(indexSignatures)
				? handlePropertySignatures(propertySignatures)
				: Effect.fail(new IndexSignaturesAreNotSupportedError()),
		),
		Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
		Effect.runSync,
	);

// Table

export const table = <DatabaseValue, TypeScriptValue = DatabaseValue>(
	schema: Schema.Schema<TypeScriptValue, DatabaseValue>,
): Validator<Record<string, any>, "required", any> =>
	goTopTable(Schema.encodedSchema(schema).ast);

const goTopTable = (
	ast: AST.AST,
): Validator<Record<string, any>, "required", any> =>
	pipe(
		ast,
		Match.value,
		Match.tag("TypeLiteral", ({ indexSignatures }) =>
			Array.isEmptyReadonlyArray(indexSignatures)
				? Effect.succeed(compileAst(ast))
				: Effect.fail(new IndexSignaturesAreNotSupportedError()),
		),
		Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
		Effect.runSync,
	);

// Compiler

export type ReadonlyOrMutableValue = Value | ReadonlyValue;

export type ReadonlyValue =
	| string
	| number
	| bigint
	| boolean
	| ArrayBuffer
	| ReadonlyArrayValue
	| ReadonlyRecordValue
	| null;

type ReadonlyOrMutableArray<T> = ReadonlyArray<T> | Array<T>;

type ReadonlyOrMutableRecord<T> = ReadonlyRecord<string, T> | Record<string, T>;

type ReadonlyArrayValue = readonly ReadonlyValue[];

export type ReadonlyRecordValue = {
	readonly [key: string]: ReadonlyValue | undefined;
};

export type ValueToValidator<Vl> = [Vl] extends [never]
	? never
	: IsAny<Vl> extends true
		? VAny
		: [Vl] extends [ReadonlyOrMutableValue]
			? Vl extends {
					__tableName: infer TableName extends string;
				}
				? VId<GenericId<TableName>>
				: IsValueLiteral<Vl> extends true
					? VLiteral<Vl>
					: Vl extends null
						? VNull
						: Vl extends number
							? VFloat64
							: Vl extends bigint
								? VInt64
								: Vl extends boolean
									? VBoolean
									: Vl extends string
										? VString
										: Vl extends ArrayBuffer
											? VBytes
											: Vl extends ReadonlyOrMutableArray<ReadonlyOrMutableValue>
												? ArrayValueToValidator<Vl>
												: Vl extends ReadonlyOrMutableRecord<ReadonlyOrMutableValue>
													? RecordValueToValidator<Vl>
													: IsUnion<Vl> extends true
														? UnionValueToValidator<Vl>
														: never
			: never;

type ArrayValueToValidator<
	Vl extends ReadonlyOrMutableArray<ReadonlyOrMutableValue>,
> = Vl extends ReadonlyOrMutableArray<infer El extends ReadonlyOrMutableValue>
	? ValueToValidator<El> extends infer Vd extends Validator<any, any, any>
		? VArray<WritableDeep<El[]>, Vd>
		: never
	: never;

type RecordValueToValidator<
	Vl extends ReadonlyOrMutableRecord<ReadonlyOrMutableValue>,
> = {
	-readonly [K in keyof Vl]-?: IsAny<Vl[K]> extends true
		? IsOptional<Vl, K> extends true
			? VOptional<VAny>
			: VAny
		: UndefinedOrValueToValidator<Vl[K]>;
} extends infer VdRecord extends Record<string, any>
	? {
			-readonly [K in keyof Vl]: WritableDeep<Vl[K]>;
		} extends infer VlRecord extends Record<string, any>
		? VObject<VlRecord, VdRecord>
		: never
	: never;

export type UndefinedOrValueToValidator<
	Vl extends ReadonlyOrMutableValue | undefined,
> = undefined extends Vl
	? // biome-ignore format: This erroneously removes the below parentheses!
		[Vl] extends [(infer Val extends ReadonlyOrMutableValue) | undefined]
    ? ValueToValidator<Val> extends infer Vd extends Validator<
        any,
        OptionalProperty,
        any
      >
      ? VOptional<Vd>
      : never
    : never
	: Vl extends ReadonlyOrMutableValue
		? ValueToValidator<Vl>
		: never;

type UnionValueToValidator<Vl extends ReadonlyOrMutableValue> = [Vl] extends [
	ReadonlyOrMutableValue,
]
	? IsUnion<Vl> extends true
		? UnionToTuple<Vl> extends infer VlTuple extends
				ReadonlyOrMutableArray<ReadonlyOrMutableValue>
			? ValueTupleToValidatorTuple<VlTuple> extends infer VdTuple extends
					Validator<any, "required", any>[]
				? VUnion<WritableDeep<Vl>, VdTuple>
				: never
			: never
		: never
	: never;

type ValueTupleToValidatorTuple<
	VlTuple extends ReadonlyOrMutableArray<ReadonlyOrMutableValue>,
> = VlTuple extends
	| [
			true,
			false,
			...infer VlRest extends ReadonlyOrMutableArray<ReadonlyOrMutableValue>,
	  ]
	| [
			false,
			true,
			// biome-ignore lint/suspicious/noRedeclare:
			...infer VlRest extends ReadonlyOrMutableArray<ReadonlyOrMutableValue>,
	  ]
	? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends Validator<
			any,
			any,
			any
		>[]
		? [VBoolean<boolean>, ...VdRest]
		: never
	: VlTuple extends [
				infer Vl extends ReadonlyOrMutableValue,
				...infer VlRest extends ReadonlyOrMutableArray<ReadonlyOrMutableValue>,
			]
		? ValueToValidator<Vl> extends infer Vd extends Validator<any, any, any>
			? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends
					Validator<any, "required", any>[]
				? [Vd, ...VdRest]
				: never
			: never
		: [];

export type TableSchemaToTableValidator<
	TableSchema extends Schema.Schema<any>,
> = ValueToValidator<
	Schema.Schema.Encoded<TableSchema>
> extends infer Vd extends VObject<any, any, any>
	? Vd
	: never;

export const compileTableSchema = <A, I>(
	tableSchema: Schema.Schema<A, I>,
): TableSchemaToTableValidator<typeof tableSchema> =>
	compileAst(Schema.encodedSchema(tableSchema).ast) as any;

export const compileSchema = <A extends ReadonlyValue>(
	schema: Schema.Schema<A>,
): ValueToValidator<Schema.Schema.Encoded<typeof schema>> =>
	compileAst(schema.ast) as any;

export const compileAst = (ast: AST.AST): Validator<any, any, any> =>
	pipe(
		ast,
		Match.value,
		Match.tag("Literal", ({ literal }) =>
			pipe(
				literal,
				Match.value,
				Match.whenOr(
					Match.string,
					Match.number,
					Match.bigint,
					Match.boolean,
					(l) => v.literal(l),
				),
				Match.when(Match.null, () => v.null()),
				Match.exhaustive,
				Effect.succeed,
			),
		),
		Match.tag("BooleanKeyword", () => Effect.succeed(v.boolean())),
		Match.tag("StringKeyword", () => Effect.succeed(v.string())),
		Match.tag("NumberKeyword", () => Effect.succeed(v.float64())),
		Match.tag("BigIntKeyword", () => Effect.succeed(v.int64())),
		Match.tag("Union", ({ types: [first, second, ...rest] }) =>
			Effect.succeed(
				v.union(
					compileAst(first),
					compileAst(second),
					...Array.map(rest, compileAst),
				),
			),
		),
		Match.tag("TypeLiteral", (typeLiteral) => handleTypeLiteral(typeLiteral)),
		Match.tag("TupleType", ({ elements, rest }) => {
			const restValidator = pipe(
				rest,
				Array.head,
				Option.map(({ type }) => compileAst(type)),
			);

			const [f, s, ...r] = elements;

			const elementToValidator = ({
				type,
				isOptional,
			}: AST.OptionalType): Validator<any, any, any> =>
				isOptional ? v.optional(compileAst(type)) : compileAst(type);

			const arrayItemsValidator: Effect.Effect<
				Validator<any, any, any>,
				EmptyTupleIsNotSupportedError
			> = f === undefined
				? Option.match(restValidator, {
						onNone: () => Effect.fail(new EmptyTupleIsNotSupportedError()),
						onSome: (validator) => Effect.succeed(validator),
					})
				: s === undefined
					? Option.match(restValidator, {
							onNone: () => Effect.succeed(elementToValidator(f)),
							onSome: (validator) =>
								Effect.succeed(v.union(elementToValidator(f), validator)),
						})
					: Effect.succeed(
							v.union(
								elementToValidator(f),
								elementToValidator(s),
								...Array.map(r, elementToValidator),
								...Option.match(restValidator, {
									onSome: (validator) => [validator] as const,
									onNone: () => [] as const,
								}),
							),
						);

			return pipe(
				arrayItemsValidator,
				Effect.map((validator) => v.array(validator)),
			);
		}),
		Match.tag("UnknownKeyword", "AnyKeyword", () => Effect.succeed(v.any())),
		Match.tag(
			"Declaration",
			"UniqueSymbol",
			"SymbolKeyword",
			"UndefinedKeyword",
			"VoidKeyword",
			"NeverKeyword",
			"Enums",
			"TemplateLiteral",
			"ObjectKeyword",
			"Suspend",
			"Transformation",
			"Refinement",
			unsupportedEffectSchemaTypeError,
		),
		Match.exhaustive,
		Effect.runSync,
	);

const handleTypeLiteral = ({
	indexSignatures,
	propertySignatures,
}: AST.TypeLiteral) =>
	pipe(
		indexSignatures,
		Array.head,
		Option.match({
			onNone: () =>
				pipe(
					propertySignatures,
					handlePropertySignatures,
					Effect.map(v.object),
				),
			onSome: () => Effect.fail(new IndexSignaturesAreNotSupportedError()),
		}),
	);

const handlePropertySignatures = (
	propertySignatures: readonly AST.PropertySignature[],
) =>
	pipe(
		propertySignatures,
		Effect.forEach(({ type, name, isOptional }) => {
			const typeofName = typeof name;

			if (typeofName !== "string") {
				return Effect.fail(
					new UnsupportedPropertySignatureKeyTypeError({ keyType: typeofName }),
				);
			} else {
				const validator = compileAst(type);

				return Effect.succeed({
					propertyName: name,
					validator: isOptional ? v.optional(validator) : validator,
				});
			}
		}),
		Effect.andThen((propertyNamesWithValidators) =>
			pipe(
				propertyNamesWithValidators,
				Array.reduce(
					{} as Record<string, Validator<any, any, any>>,
					(acc, { propertyName, validator }) => ({
						[propertyName]: validator,
						...acc,
					}),
				),
				Effect.succeed,
			),
		),
	);

// Errors

class TopLevelMustBeObjectError extends Data.TaggedError(
	"TopLevelMustBeObjectError",
) {}

class UnsupportedPropertySignatureKeyTypeError extends Data.TaggedError(
	"UnsupportedPropertySignatureKeyTypeError",
)<{
	readonly keyType: string;
}> {}

class EmptyTupleIsNotSupportedError extends Data.TaggedError(
	"EmptyTupleIsNotSupportedError",
) {}

class UnsupportedEffectSchemaTypeError extends Data.TaggedError(
	"UnsupportedEffectSchemaTypeError",
)<{
	readonly effectSchemaType: AST.AST["_tag"];
}> {}

class IndexSignaturesAreNotSupportedError extends Data.TaggedError(
	"IndexSignaturesAreNotSupportedError",
) {}

const unsupportedEffectSchemaTypeError = ({ _tag }: AST.AST) =>
	Effect.fail(new UnsupportedEffectSchemaTypeError({ effectSchemaType: _tag }));
