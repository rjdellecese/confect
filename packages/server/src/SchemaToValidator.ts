import type {
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
  VOptional,
  VRecord,
  VString,
  VUnion,
} from "convex/values";
import { v } from "convex/values";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Number from "effect/Number";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as String from "effect/String";

import * as GenericId from "@confect/core/GenericId";
import { runSyncThrowInIsolate } from "./internal/runSyncInIsolate";
import type {
  IsAny,
  IsOptional,
  IsRecord,
  IsRecursive,
  IsUnion,
  TypeError,
  UnionToTuple,
} from "@confect/core/Types";

// Args

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
        : Effect.fail(new IndexSignaturesAreNotSupportedError()),
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    runSyncThrowInIsolate,
  );
};

// Returns

export const compileReturnsSchema = <ConfectValue, ConvexValue>(
  schema: Schema.Codec<ConfectValue, ConvexValue>,
): Validator<any, any, any> =>
  runSyncThrowInIsolate(compileAst(Schema.toEncoded(schema).ast));

// Table

/**
 * Convert a table `Schema` to a table `Validator`.
 */
export type TableSchemaToTableValidator<
  TableSchema extends Schema.Codec<any, any>,
> =
  ValueToValidator<TableSchema["Encoded"]> extends infer Vd extends
    | VObject<any, any, any, any>
    | VUnion<any, any, any, any>
    ? Vd
    : never;

export const compileTableSchema = <TableSchema extends Schema.Codec<any, any>>(
  schema: TableSchema,
): TableSchemaToTableValidator<TableSchema> => {
  const ast = Schema.toEncoded(schema).ast;

  return pipe(
    ast,
    Match.value,
    Match.tag("Objects", ({ indexSignatures }) =>
      Array.isReadonlyArrayEmpty(indexSignatures)
        ? (compileAst(ast) as Effect.Effect<any>)
        : Effect.fail(new IndexSignaturesAreNotSupportedError()),
    ),
    Match.tag("Union", (unionAst) => compileAst(unionAst)),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectOrUnionError())),
    runSyncThrowInIsolate,
  );
};

// Compiler

export type ReadonlyValue =
  | string
  | number
  | bigint
  | boolean
  | ArrayBuffer
  | ReadonlyArrayValue
  | ReadonlyRecordValue
  | null;

type ReadonlyArrayValue = readonly ReadonlyValue[];

export type ReadonlyRecordValue = {
  readonly [key: string]: ReadonlyValue | undefined;
};

type MutableValue<T> =
  T extends ReadonlyArray<infer El>
    ? MutableValue<El>[]
    : T extends ReadonlyRecordValue
      ? { -readonly [K in keyof T]: MutableValue<Exclude<T[K], undefined>> }
      : T;

export type ValueToValidator<Vl> = [Vl] extends [never]
  ? never
  : IsAny<Vl> extends true
    ? VAny
    : [Vl] extends [null]
      ? VNull
      : [Vl] extends [boolean]
        ? [boolean] extends [Vl]
          ? VBoolean
          : VLiteral<Vl>
        : IsUnion<Vl> extends true
          ? IsRecursive<Vl> extends true
            ? VAny
            : [Vl] extends [ReadonlyValue]
              ? UnionValueToValidator<Vl>
              : TypeError<"Provided value is not a valid Convex value", Vl>
          : [Vl] extends [number]
            ? [number] extends [Vl]
              ? VFloat64
              : VLiteral<Vl>
            : [Vl] extends [bigint]
              ? [bigint] extends [Vl]
                ? VInt64
                : VLiteral<Vl>
              : [Vl] extends [string]
                ? Vl extends {
                    __tableName: infer TableName extends string;
                  }
                  ? VId<GenericId.GenericId<TableName>>
                  : [string] extends [Vl]
                    ? VString
                    : VLiteral<Vl>
                : [Vl] extends [ArrayBuffer]
                  ? VBytes
                  : IsRecursive<Vl> extends true
                    ? VAny
                    : [Vl] extends [ReadonlyValue]
                      ? Vl extends ReadonlyArray<ReadonlyValue>
                        ? ArrayValueToValidator<Vl>
                        : Vl extends ReadonlyRecordValue
                          ? RecordValueToValidator<Vl>
                          : TypeError<"Unexpected value", Vl>
                      : TypeError<
                          "Provided value is not a valid Convex value",
                          Vl
                        >;

type ArrayValueToValidator<Vl extends ReadonlyArray<ReadonlyValue>> =
  Vl extends ReadonlyArray<infer El extends ReadonlyValue>
    ? ValueToValidator<El> extends infer Vd extends Validator<any, any, any>
      ? VArray<MutableValue<El[]>, Vd>
      : never
    : never;

type RecordValueToValidator<Vl> = Vl extends ReadonlyRecordValue
  ? {
      -readonly [K in keyof Vl]-?: IsAny<Vl[K]> extends true
        ? IsOptional<Vl, K> extends true
          ? VOptional<VAny>
          : VAny
        : UndefinedOrValueToValidator<Vl[K]>;
    } extends infer VdRecord extends Record<string, any>
    ? MutableValue<Vl> extends infer VlRecord extends Record<string, any>
      ? IsRecord<VlRecord> extends true
        ? VRecord<VlRecord, VString, VdRecord[keyof VdRecord]>
        : VObject<VlRecord, VdRecord>
      : never
    : never
  : never;

export type UndefinedOrValueToValidator<Vl extends ReadonlyValue | undefined> =
  undefined extends Vl
    ? [Vl] extends [(infer Val extends ReadonlyValue) | undefined]
      ? ValueToValidator<Val> extends infer Vd extends Validator<
          any,
          "required",
          any
        >
        ? VOptional<Vd>
        : never
      : never
    : [Vl] extends [ReadonlyValue]
      ? ValueToValidator<Vl>
      : never;

type UnionValueToValidator<Vl extends ReadonlyValue> = [Vl] extends [
  ReadonlyValue,
]
  ? IsUnion<Vl> extends true
    ? UnionToTuple<Vl> extends infer VlTuple extends
        ReadonlyArray<ReadonlyValue>
      ? ValueTupleToValidatorTuple<VlTuple> extends infer VdTuple extends
          Validator<any, "required", any>[]
        ? VUnion<MutableValue<Vl>, VdTuple>
        : TypeError<"Failed to convert value tuple to validator tuple">
      : TypeError<"Failed to convert union to tuple">
    : TypeError<"Expected a union of values, but got a single value instead">
  : TypeError<"Provided value is not a valid Convex value">;

type ValueTupleToValidatorTuple<VlTuple extends ReadonlyArray<ReadonlyValue>> =
  VlTuple extends
    | [true, false, ...infer VlRest extends ReadonlyArray<ReadonlyValue>]
    | [false, true, ...infer VlRest extends ReadonlyArray<ReadonlyValue>]
    ? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends Validator<
        any,
        any,
        any
      >[]
      ? [VBoolean<boolean>, ...VdRest]
      : never
    : VlTuple extends [
          infer Vl extends ReadonlyValue,
          ...infer VlRest extends ReadonlyArray<ReadonlyValue>,
        ]
      ? ValueToValidator<Vl> extends infer Vd extends Validator<any, any, any>
        ? ValueTupleToValidatorTuple<VlRest> extends infer VdRest extends
            Validator<any, "required", any>[]
          ? [Vd, ...VdRest]
          : never
        : never
      : [];

export const compileSchema = <T, E>(
  schema: Schema.Codec<T, E>,
): ValueToValidator<(typeof schema)["Encoded"]> =>
  runSyncThrowInIsolate(compileAst(schema.ast)) as any;

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

export const compileAst = (
  ast: SchemaAST.AST,
  isOptionalPropertyOfTypeLiteral = false,
): Effect.Effect<
  Validator<any, any, any>,
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
            declaration.run(declaration.typeParameters)(
              new ArrayBuffer(0),
              declaration,
              {},
            ) as Effect.Effect<ArrayBuffer, unknown, never>,
            {
              onSuccess: () => v.bytes(),
              onFailure: () =>
                new UnsupportedSchemaTypeError({
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
              new UnsupportedSchemaTypeError({
                schemaType: ast._tag,
              }),
            ),
        ),
        Match.exhaustive,
      );

const handleUnion = (
  { types }: SchemaAST.Union,
  isOptionalPropertyOfTypeLiteral: boolean,
) =>
  Effect.gen(function* () {
    const members = isOptionalPropertyOfTypeLiteral
      ? Array.filter(types, Predicate.not(SchemaAST.isUndefined))
      : types;

    const [firstValidator, secondValidator, ...restValidators] =
      yield* Effect.all(Array.map(members, (type) => compileAst(type)));

    if (firstValidator === undefined) {
      return yield* new EmptyUnionIsNotSupportedError();
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
                Effect.all({
                  parameter_: compileAst(parameter),
                  type_: compileAst(type),
                }),
                ({ parameter_, type_ }) => v.record(parameter_, type_),
              ),
            onSome: () =>
              Effect.fail(
                new MixedIndexAndPropertySignaturesAreNotSupportedError(),
              ),
          }),
        ),
    }),
  );

const handleArrays = ({ elements, rest }: SchemaAST.Arrays) =>
  Effect.gen(function* () {
    const [f, s, ...r] = elements;

    const elementToValidator = (element: SchemaAST.AST) =>
      SchemaAST.isOptional(element)
        ? Effect.fail(new OptionalTupleElementsAreNotSupportedError())
        : compileAst(element);

    const arrayItemsValidator = yield* f === undefined
      ? pipe(
          rest,
          Array.head,
          Option.match({
            onNone: () => Effect.fail(new EmptyTupleIsNotSupportedError()),
            onSome: (type) => compileAst(type),
          }),
        )
      : s === undefined
        ? elementToValidator(f)
        : Effect.gen(function* () {
            const firstValidator = yield* elementToValidator(f);
            const secondValidator = yield* elementToValidator(s);
            const restValidators = yield* Effect.forEach(r, elementToValidator);

            return v.union(firstValidator, secondValidator, ...restValidators);
          });

    return v.array(arrayItemsValidator);
  });

const handlePropertySignatures = (objectsAst: SchemaAST.Objects) =>
  pipe(
    objectsAst.propertySignatures,
    Effect.forEach(({ type, name }) => {
      const isOptional = SchemaAST.isOptional(type);
      if (String.isString(name)) {
        // Somehow, somewhere, keys of type number are being coerced to strings…
        return Option.match(Number.parse(name), {
          onNone: () =>
            Effect.gen(function* () {
              const validator = yield* compileAst(type, isOptional);

              return {
                propertyName: name,
                validator: isOptional ? v.optional(validator) : validator,
              };
            }),
          onSome: (number) =>
            Effect.fail(
              new UnsupportedPropertySignatureKeyTypeError({
                propertyKey: number,
              }),
            ),
        });
      } else {
        return Effect.fail(
          new UnsupportedPropertySignatureKeyTypeError({ propertyKey: name }),
        );
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

export class TopLevelMustBeObjectError extends Data.TaggedError(
  "TopLevelMustBeObjectError",
) {
  /* v8 ignore start */
  override get message() {
    return "Top level schema must be an object";
  }
  /* v8 ignore stop */
}

export class TopLevelMustBeObjectOrUnionError extends Data.TaggedError(
  "TopLevelMustBeObjectOrUnionError",
) {
  /* v8 ignore start */
  override get message() {
    return "Top level schema must be an object or a union";
  }
  /* v8 ignore stop */
}

export class UnsupportedPropertySignatureKeyTypeError extends Data.TaggedError(
  "UnsupportedPropertySignatureKeyTypeError",
)<{
  readonly propertyKey: number | symbol;
}> {
  /* v8 ignore start */
  override get message() {
    return `Unsupported property signature '${this.propertyKey.toString()}'. Property is of type '${typeof this.propertyKey}' but only 'string' properties are supported.`;
  }
  /* v8 ignore stop */
}

export class EmptyTupleIsNotSupportedError extends Data.TaggedError(
  "EmptyTupleIsNotSupportedError",
) {
  /* v8 ignore start */
  override get message() {
    return "Tuple must have at least one element";
  }
  /* v8 ignore stop */
}

export class EmptyUnionIsNotSupportedError extends Data.TaggedError(
  "EmptyUnionIsNotSupportedError",
) {
  /* v8 ignore start */
  override get message() {
    return "Union must have at least one member that compiles to a validator";
  }
  /* v8 ignore stop */
}

export class UnsupportedSchemaTypeError extends Data.TaggedError(
  "UnsupportedSchemaTypeError",
)<{
  readonly schemaType: SchemaAST.AST["_tag"];
}> {
  /* v8 ignore start */
  override get message() {
    return `Unsupported schema type '${this.schemaType}'`;
  }
  /* v8 ignore stop */
}

export class IndexSignaturesAreNotSupportedError extends Data.TaggedError(
  "IndexSignaturesAreNotSupportedError",
) {
  /* v8 ignore start */
  override get message() {
    return "Index signatures are not supported";
  }
  /* v8 ignore stop */
}

export class MixedIndexAndPropertySignaturesAreNotSupportedError extends Data.TaggedError(
  "MixedIndexAndPropertySignaturesAreNotSupportedError",
) {
  /* v8 ignore start */
  override get message() {
    return "Mixed index and property signatures are not supported";
  }
  /* v8 ignore stop */
}

export class OptionalTupleElementsAreNotSupportedError extends Data.TaggedError(
  "OptionalTupleElementsAreNotSupportedError",
) {
  /* v8 ignore start */
  override get message() {
    return "Optional tuple elements are not supported";
  }
  /* v8 ignore stop */
}
