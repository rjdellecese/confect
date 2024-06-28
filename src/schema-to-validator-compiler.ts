import { unionToTuple } from "@arktype/util";
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
import { IsUnion } from "type-fest/source/internal";

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

export type ValueToValidator<Vl extends Value> = [Vl] extends [never]
  ? never
  : [Vl] extends [Value]
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
                    : Vl extends Array<Value>
                      ? ArrayValueToValidator<Vl>
                      : Vl extends Record<string, Value | undefined>
                        ? RecordValueToValidator<Vl>
                        : IsUnion<Vl> extends true
                          ? UnionValueToValidator<Vl>
                          : never
    : never;

type ArrayValueToValidator<Vl extends Value[]> =
  Vl extends Array<infer El extends Value>
    ? ValueToValidator<El> extends infer Vd extends Validator<any>
      ? VArray<El[], Vd>
      : never
    : never;

type RecordValueToValidator<Vl extends Record<string, Value | undefined>> = {
  [K in keyof Vl]-?: UndefinedOrValueToValidator<Vl[K]>;
} extends infer VdRecord extends Record<string, any>
  ? VObject<Vl, VdRecord>
  : never;

export type UndefinedOrValueToValidator<Vl extends Value | undefined> = [
  Vl,
] extends [Value]
  ? ValueToValidator<Vl>
  : Vl extends (infer Val extends Value) | undefined
    ? ValueToValidator<Val> extends infer Vd extends Validator<
        any,
        OptionalProperty
      >
      ? VOptional<Vd>
      : never
    : never;

type IsUnion_<T, U extends T = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;

// Examples of usage:
type Test1 = IsUnion_<string>; // false
type Test2 = IsUnion_<string | number>; // true
type Test3 = IsUnion_<string | number | boolean>; // true
type Test4 = IsUnion_<never>; // false
type Test5 = IsUnion_<any>; // false (note: 'any' is not considered a union)
type Test6 = IsUnion_<string | never>; // false (because 'string | never' simplifies to 'string')

export type UnionValueToValidator<Vl extends Value> = [Vl] extends [Value]
  ? IsUnion<Vl> extends true
    ? unionToTuple<Vl> extends infer VlTuple extends Value[]
      ? ValueTupleToValidatorTuple<VlTuple> extends infer VdTuple extends
          Validator<any, "required", any>[]
        ? VUnion<Vl, VdTuple>
        : // VdTuple
          "1"
      : "2"
    : "3"
  : "4";

type ValueTupleToValidatorTuple<VlTuple extends Value[]> = VlTuple extends [
  infer Vl extends Value,
  ...infer VlRest extends Value[],
]
  ? ValueToValidator<Vl> extends infer Vd extends Validator<any>
    ? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends Validator<
        any,
        "required",
        any
      >[]
      ? [Vd, ...VdRest]
      : never
    : never
  : [];

// https://stackoverflow.com/a/52806744
export type IsValueLiteral<Vl extends Value> = [Vl] extends [never]
  ? never
  : [Vl] extends [string | number | bigint | boolean]
    ? [string] extends [Vl]
      ? false
      : [number] extends [Vl]
        ? false
        : [boolean] extends [Vl]
          ? false
          : [bigint] extends [Vl]
            ? false
            : true
    : false;

export const compileEncoded = <A, I extends Value>(
  schema: Schema.Schema<A, I>
): ValueToValidator<I> => compile(Schema.encodedSchema(schema).ast);

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
