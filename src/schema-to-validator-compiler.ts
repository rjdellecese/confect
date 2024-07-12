import { AST } from "@effect/schema";
import * as Schema from "@effect/schema/Schema";
import type {
  GenericId,
  OptionalProperty,
  PropertyValidators,
  Validator,
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
} from "convex/values";
import { v, Value } from "convex/values";
import { Array, Data, Effect, Match, Option, pipe } from "effect";
import { ReadonlyRecord } from "effect/Record";
import { DeepMutable } from "effect/Types";

import { IsUnion, IsValueLiteral, UnionToTuple } from "~/src/type-utils";

// Args

export const args = <DatabaseValue, TypeScriptValue = DatabaseValue>(
  schema: Schema.Schema<TypeScriptValue, DatabaseValue>
): PropertyValidators => goTopArgs(Schema.encodedSchema(schema).ast);

const goTopArgs = (ast: AST.AST): PropertyValidators =>
  pipe(
    ast,
    Match.value,
    Match.tag("TypeLiteral", ({ indexSignatures, propertySignatures }) =>
      Array.isEmptyReadonlyArray(indexSignatures)
        ? handlePropertySignatures(propertySignatures)
        : Effect.fail(new IndexSignaturesAreNotSupportedError())
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    Effect.runSync
  );

// Table

export const table = <DatabaseValue, TypeScriptValue = DatabaseValue>(
  schema: Schema.Schema<TypeScriptValue, DatabaseValue>
): Validator<Record<string, any>, "required", any> =>
  goTopTable(Schema.encodedSchema(schema).ast);

const goTopTable = (
  ast: AST.AST
): Validator<Record<string, any>, "required", any> =>
  pipe(
    ast,
    Match.value,
    Match.tag("TypeLiteral", ({ indexSignatures }) =>
      Array.isEmptyReadonlyArray(indexSignatures)
        ? Effect.succeed(compile(ast))
        : Effect.fail(new IndexSignaturesAreNotSupportedError())
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    Effect.runSync
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
  : [Vl] extends [ReadonlyOrMutableValue]
    ? Vl extends {
        __tableName: infer TableName extends string;
      }
      ? VId<GenericId<TableName>>
      : IsValueLiteral<Vl> extends true
        ? VLiteral<Vl>
        : Vl extends null
          ? VNull<null>
          : Vl extends number
            ? VFloat64<number>
            : Vl extends bigint
              ? VInt64<bigint>
              : Vl extends boolean
                ? VBoolean<boolean>
                : Vl extends string
                  ? VString<string>
                  : Vl extends ArrayBuffer
                    ? VBytes<ArrayBuffer>
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
> =
  Vl extends ReadonlyOrMutableArray<infer El extends ReadonlyOrMutableValue>
    ? ValueToValidator<El> extends infer Vd extends Validator<any, any, any>
      ? VArray<DeepMutable<El[]>, Vd>
      : never
    : never;

type RecordValueToValidator<
  Vl extends ReadonlyOrMutableRecord<ReadonlyOrMutableValue>,
> = {
  -readonly [K in keyof Vl]-?: UndefinedOrValueToValidator<Vl[K]>;
} extends infer VdRecord extends Record<string, any>
  ? {
      -readonly [K in keyof Vl]: DeepMutable<Vl[K]>;
    } extends infer VlRecord extends Record<string, any>
    ? VObject<VlRecord, VdRecord>
    : never
  : never;

export type UndefinedOrValueToValidator<
  Vl extends ReadonlyOrMutableValue | undefined,
> = undefined extends Vl
  ? [Vl] extends [(infer Val extends ReadonlyOrMutableValue) | undefined]
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
        ? VUnion<DeepMutable<Vl>, VdTuple>
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
> =
  ValueToValidator<Schema.Schema.Encoded<TableSchema>> extends infer Vd extends
    VObject<any, any, any>
    ? Vd
    : never;

export const compileTableSchema = <A, I>(
  tableSchema: Schema.Schema<A, I>
): TableSchemaToTableValidator<typeof tableSchema> =>
  compile(Schema.encodedSchema(tableSchema).ast) as any;

export const compileSchema = <A extends ReadonlyValue>(
  schema: Schema.Schema<A>
): ValueToValidator<Schema.Schema.Encoded<typeof schema>> =>
  compile(schema.ast) as any;

export const compile = (ast: AST.AST): Validator<any, any, any> =>
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
          (l) => v.literal(l)
        ),
        Match.when(Match.null, () => v.null()),
        Match.exhaustive,
        Effect.succeed
      )
    ),
    Match.tag("BooleanKeyword", () => Effect.succeed(v.boolean())),
    Match.tag("StringKeyword", () => Effect.succeed(v.string())),
    Match.tag("NumberKeyword", () => Effect.succeed(v.float64())),
    Match.tag("BigIntKeyword", () => Effect.succeed(v.int64())),
    Match.tag("Union", ({ types: [first, second, ...rest] }) =>
      Effect.succeed(
        v.union(compile(first), compile(second), ...Array.map(rest, compile))
      )
    ),
    Match.tag("TypeLiteral", (typeLiteral) => handleTypeLiteral(typeLiteral)),
    Match.tag("TupleType", ({ elements, rest }) => {
      const restValidator = pipe(rest, Array.head, Option.map(compile));

      const [f, s, ...r] = elements;

      const elementToValidator = ({
        type,
        isOptional,
      }: AST.Element): Validator<any, any, any> =>
        isOptional ? v.optional(compile(type)) : compile(type);

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
                })
              )
            );

      return pipe(
        arrayItemsValidator,
        Effect.map((validator) => v.array(validator))
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
      unsupportedEffectSchemaTypeError
    ),
    Match.exhaustive,
    Effect.runSync
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
          Effect.map(v.object)
        ),
      onSome: () => Effect.fail(new IndexSignaturesAreNotSupportedError()),
    })
  );

const handlePropertySignatures = (
  propertySignatures: readonly AST.PropertySignature[]
) =>
  pipe(
    propertySignatures,
    Effect.forEach(({ type, name, isOptional }) => {
      const typeofName = typeof name;

      if (typeofName !== "string") {
        return Effect.fail(
          new UnsupportedPropertySignatureKeyTypeError({ keyType: typeofName })
        );
      } else {
        const validator = compile(type);

        return Effect.succeed({
          propertyName: name,
          validator: isOptional ? v.optional(validator) : validator,
        });
      }
    }),
    Effect.flatMap((propertyNamesWithValidators) =>
      pipe(
        propertyNamesWithValidators,
        Array.reduce(
          {} as Record<string, Validator<any, any, any>>,
          (acc, { propertyName, validator }) => ({
            [propertyName]: validator,
            ...acc,
          })
        ),
        Effect.succeed
      )
    )
  );

// Errors

class TopLevelMustBeObjectError extends Data.TaggedError(
  "TopLevelMustBeObjectError"
) {}

class UnsupportedPropertySignatureKeyTypeError extends Data.TaggedError(
  "UnsupportedPropertySignatureKeyTypeError"
)<{
  readonly keyType: string;
}> {}

class EmptyTupleIsNotSupportedError extends Data.TaggedError(
  "EmptyTupleIsNotSupportedError"
) {}

class UnsupportedEffectSchemaTypeError extends Data.TaggedError(
  "UnsupportedEffectSchemaTypeError"
)<{
  readonly effectSchemaType: AST.AST["_tag"];
}> {}

class IndexSignaturesAreNotSupportedError extends Data.TaggedError(
  "IndexSignaturesAreNotSupportedError"
) {}

const unsupportedEffectSchemaTypeError = ({ _tag }: AST.AST) =>
  Effect.fail(new UnsupportedEffectSchemaTypeError({ effectSchemaType: _tag }));
