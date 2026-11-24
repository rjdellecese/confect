import type {
  GenericValidator,
  PropertyValidators,
  Validator,
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
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Number from "effect/Number";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as String from "effect/String";

import * as GenericId from "./GenericId";
import type {
  IsAny,
  IsOptional,
  IsRecord,
  IsRecursive,
  IsUnion,
  TypeError,
  UnionToTuple,
} from "./Types";

// Args

/**
 * @internal
 */
export const compileArgsSchema = <ConfectValue, ConvexValue>(
  argsSchema: Schema.Codec<ConfectValue, ConvexValue>,
): PropertyValidators => {
  const ast = Schema.toEncoded(argsSchema).ast;

  return pipe(
    ast,
    Match.value,
    Match.tag("Objects", (objectsAst) =>
      Array.isReadonlyArrayEmpty(objectsAst.indexSignatures)
        ? handlePropertySignatures(objectsAst)
        : Effect.fail(IndexSignaturesAreNotSupportedError.make()),
    ),
    Match.orElse(() => Effect.fail(TopLevelMustBeObjectError.make())),
    Effect.runSync,
  );
};

// Returns

/**
 * @internal
 */
export const compileReturnsSchema = <ConfectValue, ConvexValue>(
  schema: Schema.Codec<ConfectValue, ConvexValue>,
): GenericValidator => Effect.runSync(compileAst(Schema.toEncoded(schema).ast));

// Table

/**
 * Convert a table `Schema` to a table `Validator`.
 *
 * @internal
 */
export type TableSchemaToTableValidator<
  TableSchema extends Schema.Codec<unknown>,
> =
  ValueToValidator<TableSchema["Encoded"]> extends infer Vd extends Extract<
    GenericValidator,
    { readonly kind: "object" | "union" }
  >
    ? Vd
    : never;

/**
 * @internal
 */
export const compileTableSchema = <TableSchema extends Schema.Codec<unknown>>(
  schema: TableSchema,
): TableSchemaToTableValidator<TableSchema> => {
  const ast = Schema.toEncoded(schema).ast;

  return pipe(
    ast,
    Match.value,
    Match.tag("Objects", ({ indexSignatures }) =>
      Array.isReadonlyArrayEmpty(indexSignatures)
        ? // oxlint-disable-next-line effecttsgo/unsafe-effect-type-assertion -- The return type is derived from the input schema and cannot be recovered from the runtime AST.
          (compileAst(ast) as Effect.Effect<any>)
        : Effect.fail(IndexSignaturesAreNotSupportedError.make()),
    ),
    Match.tag("Union", (unionAst) => compileAst(unionAst)),
    Match.orElse(() => Effect.fail(TopLevelMustBeObjectOrUnionError.make())),
    Effect.runSync,
  );
};

// Compiler

/**
 * @internal
 */
export type ReadonlyValue =
  | string
  | number
  | bigint
  | boolean
  | ArrayBuffer
  | ReadonlyArrayValue
  | ReadonlyRecordValue
  | null;

type ReadonlyArrayValue = ReadonlyArray<ReadonlyValue>;

/**
 * @internal
 */
export type ReadonlyRecordValue = {
  readonly [key: string]: ReadonlyValue | undefined;
};

type MutableValue<T> =
  T extends ReadonlyArray<infer El>
    ? Array<MutableValue<El>>
    : T extends ReadonlyRecordValue
      ? { -readonly [K in keyof T]: MutableValue<Exclude<T[K], undefined>> }
      : T;

/**
 * @internal
 */
export type ValueToValidator<Vl> = [Vl] extends [never]
  ? never
  : IsAny<Vl> extends true
    ? VAny
    : [Vl] extends [string | number | bigint | boolean | null | ArrayBuffer]
      ? ConvertValueToValidator<Vl>
      : IsRecursive<Vl> extends true
        ? VAny
        : [Vl] extends [ReadonlyValue]
          ? ConvertValueToValidator<Vl>
          : TypeError<"Provided value is not a valid Convex value", Vl>;

type OptionalValue<Vl, Optionality> = Optionality extends "optional"
  ? Vl | undefined
  : Vl;

type ConvertValueToValidator<
  Vl,
  Optionality extends "required" | "optional" = "required",
> = [Vl] extends [never]
  ? never
  : IsAny<Vl> extends true
    ? VAny<Vl, Optionality>
    : [Vl] extends [null]
      ? VNull<OptionalValue<null, Optionality>, Optionality>
      : [Vl] extends [boolean]
        ? [boolean] extends [Vl]
          ? VBoolean<OptionalValue<boolean, Optionality>, Optionality>
          : VLiteral<OptionalValue<Vl, Optionality>, Optionality>
        : IsUnion<Vl> extends true
          ? UnionValueToValidator<Vl, Optionality>
          : [Vl] extends [number]
            ? [number] extends [Vl]
              ? VFloat64<OptionalValue<number, Optionality>, Optionality>
              : VLiteral<OptionalValue<Vl, Optionality>, Optionality>
            : [Vl] extends [bigint]
              ? [bigint] extends [Vl]
                ? VInt64<OptionalValue<bigint, Optionality>, Optionality>
                : VLiteral<OptionalValue<Vl, Optionality>, Optionality>
              : [Vl] extends [string]
                ? StringValueToValidator<Vl, Optionality>
                : [Vl] extends [ArrayBuffer]
                  ? VBytes<OptionalValue<ArrayBuffer, Optionality>, Optionality>
                  : IsRecursive<Vl> extends true
                    ? VAny<any, Optionality>
                    : Vl extends ReadonlyArray<infer El>
                      ? VArray<
                          OptionalValue<MutableValue<Array<El>>, Optionality>,
                          ConvertValueToValidator<El>,
                          Optionality
                        >
                      : Vl extends object
                        ? ObjectValueToValidator<Vl, Optionality>
                        : never;

type StringValueToValidator<
  Vl,
  Optionality extends "required" | "optional",
> = Vl extends { __tableName: infer TableName extends string }
  ? VId<OptionalValue<GenericId.GenericId<TableName>, Optionality>, Optionality>
  : [string] extends [Vl]
    ? VString<OptionalValue<string, Optionality>, Optionality>
    : VLiteral<OptionalValue<Vl, Optionality>, Optionality>;

type ObjectValueToValidator<Vl, Optionality extends "required" | "optional"> =
  IsRecord<MutableValue<Vl>> extends true
    ? ValueToValidator<Vl[keyof Vl]> extends infer VdValue extends Validator<
        unknown,
        "required",
        string
      >
      ? VRecord<
          OptionalValue<MutableValue<Vl>, Optionality>,
          VString,
          VdValue,
          Optionality
        >
      : never
    : ObjectFieldsToValidators<Vl> extends infer VdFields extends Record<
          string,
          any
        >
      ? VObject<
          OptionalValue<MutableValue<Vl>, Optionality>,
          VdFields,
          Optionality
        >
      : never;

type ObjectFieldsToValidators<Vl> = {
  -readonly [K in keyof Vl]-?: IsAny<Vl[K]> extends true
    ? IsOptional<Vl, K> extends true
      ? VAny<Vl[K], "optional">
      : VAny
    : undefined extends Vl[K]
      ? OptionalValueToValidator<Vl[K]>
      : [Vl[K]] extends [ReadonlyValue]
        ? ConvertValueToValidator<Vl[K]>
        : never;
};

/**
 * @internal
 */
export type UndefinedOrValueToValidator<Vl extends ReadonlyValue | undefined> =
  undefined extends Vl
    ? OptionalValueToValidator<Vl>
    : [Vl] extends [ReadonlyValue]
      ? ValueToValidator<Vl>
      : never;

type UnionValueToValidator<Vl, Optionality extends "required" | "optional"> =
  IsRecursive<Vl> extends true
    ? VAny<any, Optionality>
    : VUnion<
        OptionalValue<MutableValue<Vl>, Optionality>,
        ValueTupleToValidatorTuple<UnionToTuple<Vl>>,
        Optionality
      >;

type ValueTupleToValidatorTuple<
  VlTuple extends ReadonlyArray<unknown>,
  Acc extends Array<Validator<unknown, "required", any>> = [],
> = VlTuple extends
  | [true, false, ...infer VlRest]
  | [false, true, ...infer VlRest]
  ? ValueTupleToValidatorTuple<VlRest, [...Acc, VBoolean]>
  : VlTuple extends [infer Vl, ...infer VlRest]
    ? ValueTupleToValidatorTuple<VlRest, [...Acc, ConvertValueToValidator<Vl>]>
    : Acc;

type OptionalValueToValidator<Vl> = [Vl] extends [
  (infer Val extends ReadonlyValue) | undefined,
]
  ? ConvertValueToValidator<Val, "optional">
  : never;

/**
 * @internal
 */
export const compileSchema = <T, E>(
  schema: Schema.Codec<T, E>,
): ValueToValidator<(typeof schema)["Encoded"]> =>
  Effect.runSync(compileAst(schema.ast)) as any;

/**
 * @internal
 */
export const isRecursive = (ast: SchemaAST.AST): boolean =>
  pipe(
    ast,
    Match.value,
    Match.tag(
      "Literal",
      "Null",
      "Boolean",
      "String",
      "Number",
      "BigInt",
      "Unknown",
      "Any",
      "Declaration",
      "UniqueSymbol",
      "Symbol",
      "Undefined",
      "Void",
      "Never",
      "Enum",
      "TemplateLiteral",
      "ObjectKeyword",
      () => false,
    ),
    Match.tag("Union", ({ types }) =>
      Array.some(types, (type) => isRecursive(type)),
    ),
    Match.tag("Objects", ({ propertySignatures }) =>
      Array.some(propertySignatures, ({ type }) => isRecursive(type)),
    ),
    Match.tag(
      "Arrays",
      ({ elements, rest }) =>
        Array.some(elements, (element) => isRecursive(element)) ||
        Array.some(rest, (element) => isRecursive(element)),
    ),
    Match.tag("Suspend", () => true),
    Match.exhaustive,
  );

/**
 * @internal
 */
export const compileAst = (
  ast: SchemaAST.AST,
  isOptionalPropertyOfTypeLiteral = false,
): Effect.Effect<
  GenericValidator,
  | UnsupportedSchemaTypeError
  | UnsupportedPropertySignatureKeyTypeError
  | IndexSignaturesAreNotSupportedError
  | MixedIndexAndPropertySignaturesAreNotSupportedError
  | OptionalTupleElementsAreNotSupportedError
  | EmptyTupleIsNotSupportedError
  | EmptyUnionIsNotSupportedError
> =>
  isRecursive(ast)
    ? Effect.succeed(v.any())
    : pipe(
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
            Match.exhaustive,
            Effect.succeed,
          ),
        ),
        Match.tag("Null", () => Effect.succeed(v.null())),
        Match.tag("Boolean", () => Effect.succeed(v.boolean())),
        Match.tag("String", (stringAst) =>
          GenericId.tableName(stringAst).pipe(
            Option.match({
              onNone: () => Effect.succeed(v.string()),
              onSome: (tableName) => Effect.succeed(v.id(tableName)),
            }),
          ),
        ),
        Match.tag("Number", () => Effect.succeed(v.float64())),
        Match.tag("BigInt", () => Effect.succeed(v.int64())),
        Match.tag("Union", (unionAst) =>
          handleUnion(unionAst, isOptionalPropertyOfTypeLiteral),
        ),
        Match.tag("Objects", (objectsAst) => handleObjects(objectsAst)),
        Match.tag("Arrays", (arraysAst) => handleArrays(arraysAst)),
        Match.tag("Unknown", "Any", () => Effect.succeed(v.any())),
        Match.tag("Declaration", (declaration) =>
          Effect.mapBoth(
            // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- Codec inputs are context-free, but Effect's SchemaAST.DeclarationRun erases their requirements to `any`.
            declaration.run(declaration.typeParameters)(
              new ArrayBuffer(0),
              declaration,
              {},
            ) as Effect.Effect<ArrayBuffer, unknown, never>,
            {
              onSuccess: () => v.bytes(),
              onFailure: () =>
                UnsupportedSchemaTypeError.make({
                  schemaType: declaration._tag,
                }),
            },
          ),
        ),
        Match.tag("Suspend", () => Effect.succeed(v.any())),
        Match.tag(
          "UniqueSymbol",
          "Symbol",
          "Undefined",
          "Void",
          "Never",
          "Enum",
          "TemplateLiteral",
          "ObjectKeyword",
          () =>
            Effect.fail(
              UnsupportedSchemaTypeError.make({
                schemaType: ast._tag,
              }),
            ),
        ),
        Match.exhaustive,
      );

const handleUnion = (
  { types }: SchemaAST.Union,
  isOptionalPropertyOfTypeLiteral: boolean,
) => handleUnionTypes(types, isOptionalPropertyOfTypeLiteral);

const handleUnionTypes = Effect.fnUntraced(function* (
  types: SchemaAST.Union["types"],
  isOptionalPropertyOfTypeLiteral: boolean,
) {
  const members = isOptionalPropertyOfTypeLiteral
    ? Array.filter(types, Predicate.not(SchemaAST.isUndefined))
    : types;

  const [firstValidator, secondValidator, ...restValidators] =
    yield* Effect.all(
      Array.map(members, (type) => compileAst(type)),
      { concurrency: 1 },
    );

  if (firstValidator === undefined) {
    return yield* EmptyUnionIsNotSupportedError.make();
  } else if (secondValidator === undefined) {
    return firstValidator;
  } else {
    return v.union(firstValidator, secondValidator, ...restValidators);
  }
});

const handleObjects = (objectsAst: SchemaAST.Objects) =>
  pipe(
    objectsAst.indexSignatures,
    Array.head,
    Option.match({
      onNone: () => Effect.map(handlePropertySignatures(objectsAst), v.object),
      onSome: ({ parameter, type }) =>
        pipe(
          objectsAst.propertySignatures,
          Array.head,
          Option.match({
            onNone: () =>
              Effect.map(
                Effect.all(
                  {
                    parameter_: compileAst(parameter),
                    type_: compileAst(type),
                  },
                  { concurrency: 1 },
                ),
                ({ parameter_, type_ }) => v.record(parameter_, type_),
              ),
            onSome: () =>
              Effect.fail(
                MixedIndexAndPropertySignaturesAreNotSupportedError.make(),
              ),
          }),
        ),
    }),
  );

const handleArrays = ({ elements, rest }: SchemaAST.Arrays) =>
  handleArrayElements(elements, rest);

const elementToValidator = (element: SchemaAST.AST) =>
  SchemaAST.isOptional(element)
    ? Effect.fail(OptionalTupleElementsAreNotSupportedError.make())
    : compileAst(element);

const handleArrayElements = Effect.fnUntraced(function* (
  elements: SchemaAST.Arrays["elements"],
  rest: SchemaAST.Arrays["rest"],
) {
  const [f, s, ...r] = elements;

  const arrayItemsValidator = yield* f === undefined
    ? pipe(
        rest,
        Array.head,
        Option.match({
          onNone: () => Effect.fail(EmptyTupleIsNotSupportedError.make()),
          onSome: (type) => compileAst(type),
        }),
      )
    : s === undefined
      ? elementToValidator(f)
      : Effect.gen(function* () {
          const firstValidator = yield* elementToValidator(f);
          const secondValidator = yield* elementToValidator(s);
          const restValidators = yield* Effect.forEach(r, elementToValidator, {
            concurrency: 1,
          });

          return v.union(firstValidator, secondValidator, ...restValidators);
        });

  return v.array(arrayItemsValidator);
});

const handlePropertySignatures = (objectsAst: SchemaAST.Objects) =>
  pipe(
    objectsAst.propertySignatures,
    Effect.forEach(
      ({ type, name }) => {
        const isOptional = SchemaAST.isOptional(type);
        if (String.isString(name)) {
          // Somehow, somewhere, keys of type number are being coerced to strings…
          return Option.match(Number.parse(name), {
            onNone: () =>
              Effect.gen(function* () {
                const validator = yield* compileAst(type, isOptional);

                return [
                  name,
                  isOptional ? v.optional(validator) : validator,
                ] as const;
              }),
            onSome: (number) =>
              Effect.fail(
                UnsupportedPropertySignatureKeyTypeError.make({
                  propertyKey: number,
                }),
              ),
          });
        } else {
          return Effect.fail(
            UnsupportedPropertySignatureKeyTypeError.make({
              propertyKey: name,
            }),
          );
        }
      },
      { concurrency: 1 },
    ),
    Effect.map((entries) => Record.fromEntries(Array.reverse(entries))),
  );

// Errors

/**
 * @internal
 */
export class TopLevelMustBeObjectError extends Schema.TaggedError<
  TopLevelMustBeObjectError,
  unknown
>()("TopLevelMustBeObjectError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Top level schema must be an object";
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class TopLevelMustBeObjectOrUnionError extends Schema.TaggedError<
  TopLevelMustBeObjectOrUnionError,
  unknown
>()("TopLevelMustBeObjectOrUnionError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Top level schema must be an object or a union";
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class UnsupportedPropertySignatureKeyTypeError extends Schema.TaggedError<
  UnsupportedPropertySignatureKeyTypeError,
  unknown
>()("UnsupportedPropertySignatureKeyTypeError", {
  propertyKey: Schema.declare<number | symbol>(
    (input): input is number | symbol =>
      typeof input === "number" || typeof input === "symbol",
  ),
}) {
  /* v8 ignore start */
  override get message() {
    return `Unsupported property signature '${this.propertyKey.toString()}'. Property is of type '${typeof this.propertyKey}' but only 'string' properties are supported.`;
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class EmptyTupleIsNotSupportedError extends Schema.TaggedError<
  EmptyTupleIsNotSupportedError,
  unknown
>()("EmptyTupleIsNotSupportedError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Tuple must have at least one element";
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class EmptyUnionIsNotSupportedError extends Schema.TaggedError<
  EmptyUnionIsNotSupportedError,
  unknown
>()("EmptyUnionIsNotSupportedError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Union must have at least one member that compiles to a validator";
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class UnsupportedSchemaTypeError extends Schema.TaggedError<
  UnsupportedSchemaTypeError,
  unknown
>()("UnsupportedSchemaTypeError", {
  schemaType: Schema.Literals([
    "Declaration",
    "Null",
    "Undefined",
    "Void",
    "Never",
    "Unknown",
    "Any",
    "String",
    "Number",
    "Boolean",
    "BigInt",
    "Symbol",
    "Literal",
    "UniqueSymbol",
    "ObjectKeyword",
    "Enum",
    "TemplateLiteral",
    "Arrays",
    "Objects",
    "Union",
    "Suspend",
  ]),
}) {
  /* v8 ignore start */
  override get message() {
    return `Unsupported schema type '${this.schemaType}'`;
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class IndexSignaturesAreNotSupportedError extends Schema.TaggedError<
  IndexSignaturesAreNotSupportedError,
  unknown
>()("IndexSignaturesAreNotSupportedError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Index signatures are not supported";
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class MixedIndexAndPropertySignaturesAreNotSupportedError extends Schema.TaggedError<
  MixedIndexAndPropertySignaturesAreNotSupportedError,
  unknown
>()("MixedIndexAndPropertySignaturesAreNotSupportedError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Mixed index and property signatures are not supported";
  }
  /* v8 ignore stop */
}

/**
 * @internal
 */
export class OptionalTupleElementsAreNotSupportedError extends Schema.TaggedError<
  OptionalTupleElementsAreNotSupportedError,
  unknown
>()("OptionalTupleElementsAreNotSupportedError", {}) {
  /* v8 ignore start */
  override get message() {
    return "Optional tuple elements are not supported";
  }
  /* v8 ignore stop */
}
