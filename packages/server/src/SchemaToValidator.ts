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
import {
  Array,
  Cause,
  Data,
  Effect,
  Exit,
  Match,
  Number,
  Option,
  pipe,
  Predicate,
  Schema,
  SchemaAST,
  String,
} from "effect";

import * as GenericId from "@confect/core/GenericId";
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
  argsSchema: Schema.Codec<ConfectValue, ConvexValue, never, never>,
): PropertyValidators => {
  const ast = Schema.toEncoded(argsSchema).ast;

  return pipe(
    ast,
    Match.value,
    Match.tag("Objects", (typeLiteralAst) =>
      typeLiteralAst.indexSignatures.length === 0
        ? handlePropertySignatures(typeLiteralAst)
        : Effect.fail(new IndexSignaturesAreNotSupportedError()),
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    runSyncThrow,
  );
};

// Returns

export const compileReturnsSchema = <ConfectValue, ConvexValue>(
  schema: Schema.Codec<ConfectValue, ConvexValue, never, never>,
): Validator<any, any, any> =>
  runSyncThrow(compileAst(Schema.toEncoded(schema).ast));

// Table

/**
 * Convert a table `Schema` to a table `Validator`.
 */
export type TableSchemaToTableValidator<
  TableSchema extends Schema.Codec<any, any, never, never>,
> =
  ValueToValidator<TableSchema["Encoded"]> extends infer Vd extends
    | VObject<any, any, any, any>
    | VUnion<any, any, any, any>
    ? Vd
    : never;

export const compileTableSchema = <
  TableSchema extends Schema.Codec<any, any, never, never>,
>(
  schema: TableSchema,
): TableSchemaToTableValidator<TableSchema> => {
  const ast = Schema.toEncoded(schema).ast;

  return pipe(
    ast,
    Match.value,
    Match.tag("Objects", ({ indexSignatures }) =>
      indexSignatures.length === 0
        ? (compileAst(ast) as Effect.Effect<any>)
        : Effect.fail(new IndexSignaturesAreNotSupportedError()),
    ),
    Match.tag("Union", (unionAst) => compileAst(unionAst)),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectOrUnionError())),
    runSyncThrow,
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
      ? { -readonly [K in keyof T]: MutableValue<T[K]> }
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
    ? {
        -readonly [K in keyof Vl]: undefined extends Vl[K]
          ? MutableValue<Exclude<Vl[K], undefined>>
          : MutableValue<Vl[K]>;
      } extends infer VlRecord extends Record<string, any>
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
  schema: Schema.Codec<T, E, never, never>,
): ValueToValidator<(typeof schema)["Encoded"]> =>
  runSyncThrow(compileAst(schema.ast)) as any;

export const isRecursive = (ast: SchemaAST.AST): boolean =>
  pipe(
    ast,
    Match.value,
    Match.tag(
      "Literal",
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
      "Null",
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
    // In Effect 4 there is no separate `Refinement`/`Transformation` AST tag —
    // refinements live as `checks` and transformations live as `encoding` on
    // the underlying Base node, so the `from` schema is the AST itself.
    Match.tag(
      "Arrays",
      ({ elements, rest }) =>
        Array.some(elements, (el) => isRecursive(el)) ||
        Array.some(rest, (r) => isRecursive(r)),
    ),
    Match.tag("Suspend", () => true),
    Match.exhaustive,
  );

type CompileAstError =
  | UnsupportedSchemaTypeError
  | UnsupportedPropertySignatureKeyTypeError
  | IndexSignaturesAreNotSupportedError
  | MixedIndexAndPropertySignaturesAreNotSupportedError
  | OptionalTupleElementsAreNotSupportedError
  | EmptyTupleIsNotSupportedError;

export const compileAst = (
  ast: SchemaAST.AST,
  isOptionalPropertyOfTypeLiteral = false,
): Effect.Effect<Validator<any, any, any>, CompileAstError> =>
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
        Match.tag("Objects", (typeLiteralAst) =>
          handleTypeLiteral(typeLiteralAst),
        ),
        Match.tag("Arrays", (tupleTypeAst) => handleTupleType(tupleTypeAst)),
        Match.tag("Unknown", "Any", () => Effect.succeed(v.any())),
        Match.tag("Declaration", (declaration) =>
          handleDeclaration(declaration),
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

// In Effect 4, Declaration#run is the parser factory. To detect a "bytes"
// declaration (e.g. `Schema.instanceOf(ArrayBuffer)` or `Schema.Uint8Array`),
// we attempt to parse a freshly-allocated `ArrayBuffer` / `Uint8Array` and
// treat anything that succeeds as a bytes validator. Anything else is rejected
// as an unsupported declaration.
const handleDeclaration = (
  declaration: SchemaAST.Declaration,
): Effect.Effect<Validator<any, any, any>, CompileAstError> =>
  Effect.gen(function* () {
    const encodedAst = declaration.encoding?.[0]?.to;
    if (encodedAst !== undefined && encodedAst._tag === "Objects") {
      return yield* compileAst(encodedAst);
    }

    const typeConstructor = declaration.annotations?.["typeConstructor"] as
      | { readonly _tag?: string }
      | undefined;
    if (typeConstructor?._tag === "effect/Option") {
      const [valueAst] = declaration.typeParameters;
      if (valueAst === undefined) {
        return yield* Effect.die(
          new Error("Option declaration is missing its value type parameter."),
        );
      }
      const valueValidator = yield* compileAst(valueAst);

      return v.object({ value: v.optional(valueValidator) });
    }

    const rawParser = declaration.run(declaration.typeParameters);
    const parser = (input: unknown): Effect.Effect<unknown, unknown> =>
      rawParser(input, declaration, {}) as Effect.Effect<unknown, unknown>;

    const arrayBufferResult = yield* Effect.exit(parser(new ArrayBuffer(0)));

    if (Exit.isSuccess(arrayBufferResult)) {
      return v.bytes();
    }

    const uint8ArrayResult = yield* Effect.exit(parser(new Uint8Array(0)));

    if (Exit.isSuccess(uint8ArrayResult)) {
      return v.bytes();
    }

    return yield* new UnsupportedSchemaTypeError({
      schemaType: declaration._tag,
    });
  });

const handleUnion = (
  { types }: SchemaAST.Union,
  isOptionalPropertyOfTypeLiteral: boolean,
) =>
  Effect.gen(function* () {
    const consideredTypes: ReadonlyArray<SchemaAST.AST> =
      isOptionalPropertyOfTypeLiteral
        ? Array.filter(types, Predicate.not(SchemaAST.isUndefined))
        : types;

    const validatorEffects: ReadonlyArray<ReturnType<typeof compileAst>> =
      Array.map(consideredTypes, (type) => compileAst(type));

    const [firstValidator, secondValidator, ...restValidators] =
      yield* Effect.all(validatorEffects);

    /* v8 ignore start */
    if (firstValidator === undefined) {
      return yield* Effect.die(
        new Error(
          "First validator of union is undefined; this should be impossible.",
        ),
      );
      /* v8 ignore stop */
    } else if (secondValidator === undefined) {
      return firstValidator;
    } else {
      return v.union(firstValidator, secondValidator, ...restValidators);
    }
  });

const handleTypeLiteral = (typeLiteralAst: SchemaAST.Objects) =>
  pipe(
    typeLiteralAst.indexSignatures,
    Array.head,
    Option.match({
      onNone: () =>
        Effect.map(handlePropertySignatures(typeLiteralAst), v.object),
      onSome: ({ parameter, type }) =>
        pipe(
          typeLiteralAst.propertySignatures,
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

const handleTupleType = ({ elements, rest }: SchemaAST.Arrays) =>
  Effect.gen(function* () {
    const restValidator: Effect.Effect<
      Validator<any, any, any>,
      CompileAstError
    > = pipe(
      rest,
      Array.head,
      Option.match({
        onNone: () => Effect.fail(new EmptyTupleIsNotSupportedError()),
        onSome: (restAst) => compileAst(restAst),
      }),
    );

    const [f, s, ...r] = elements;

    const elementToValidator = (elementAst: SchemaAST.AST) =>
      SchemaAST.isOptional(elementAst)
        ? Effect.fail(new OptionalTupleElementsAreNotSupportedError())
        : compileAst(elementAst);

    const arrayItemsValidator = yield* f === undefined
      ? restValidator
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

const handlePropertySignatures = (typeLiteralAst: SchemaAST.Objects) =>
  pipe(
    typeLiteralAst.propertySignatures,
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

const runSyncThrow = <A, E>(effect: Effect.Effect<A, E>) =>
  pipe(
    effect,
    Effect.runSyncExit,
    Exit.match({
      onSuccess: (validator) => validator,
      onFailure: (cause) => {
        throw Cause.squash(cause);
      },
    }),
  );

export class TopLevelMustBeObjectError extends Data.TaggedError(
  "TopLevelMustBeObjectError",
) {
  /* v8 ignore start */
  get message() {
    return "Top level schema must be an object";
  }
  /* v8 ignore stop */
}

export class TopLevelMustBeObjectOrUnionError extends Data.TaggedError(
  "TopLevelMustBeObjectOrUnionError",
) {
  /* v8 ignore start */
  get message() {
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
  get message() {
    return `Unsupported property signature '${this.propertyKey.toString()}'. Property is of type '${typeof this.propertyKey}' but only 'string' properties are supported.`;
  }
  /* v8 ignore stop */
}

export class EmptyTupleIsNotSupportedError extends Data.TaggedError(
  "EmptyTupleIsNotSupportedError",
) {
  /* v8 ignore start */
  get message() {
    return "Tuple must have at least one element";
  }
  /* v8 ignore stop */
}

export class UnsupportedSchemaTypeError extends Data.TaggedError(
  "UnsupportedSchemaTypeError",
)<{
  readonly schemaType: SchemaAST.AST["_tag"];
}> {
  /* v8 ignore start */
  get message() {
    return `Unsupported schema type '${this.schemaType}'`;
  }
  /* v8 ignore stop */
}

export class IndexSignaturesAreNotSupportedError extends Data.TaggedError(
  "IndexSignaturesAreNotSupportedError",
) {
  /* v8 ignore start */
  get message() {
    return "Index signatures are not supported";
  }
  /* v8 ignore stop */
}

export class MixedIndexAndPropertySignaturesAreNotSupportedError extends Data.TaggedError(
  "MixedIndexAndPropertySignaturesAreNotSupportedError",
) {
  /* v8 ignore start */
  get message() {
    return "Mixed index and property signatures are not supported";
  }
  /* v8 ignore stop */
}

export class OptionalTupleElementsAreNotSupportedError extends Data.TaggedError(
  "OptionalTupleElementsAreNotSupportedError",
) {
  /* v8 ignore start */
  get message() {
    return "Optional tuple elements are not supported";
  }
  /* v8 ignore stop */
}
