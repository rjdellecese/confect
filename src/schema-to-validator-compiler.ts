import type * as AST from "@effect/schema/AST";
import * as Schema from "@effect/schema/Schema";
import type { PropertyValidators, Validator } from "convex/values";
import { v } from "convex/values";
import { Effect, Match, Option, pipe, ReadonlyArray } from "effect";

// Args

const args = <DatabaseValue, TypeScriptValue = DatabaseValue>(
  schema: Schema.Schema<TypeScriptValue, DatabaseValue>,
): PropertyValidators => goTopArgs(Schema.encodedSchema(schema).ast);

const goTopArgs = (ast: AST.AST): PropertyValidators =>
  pipe(
    ast,
    Match.value,
    Match.tag("TypeLiteral", ({ indexSignatures, propertySignatures }) =>
      ReadonlyArray.isEmptyReadonlyArray(indexSignatures)
        ? handlePropertySignatures(propertySignatures)
        : Effect.fail(new IndexSignaturesAreNotSupportedError()),
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    Effect.runSync,
  );

// Table

const table = <DatabaseValue, TypeScriptValue = DatabaseValue>(
  schema: Schema.Schema<TypeScriptValue, DatabaseValue>,
): Validator<Record<string, any>, false, any> =>
  goTopTable(Schema.encodedSchema(schema).ast);

const goTopTable = (ast: AST.AST): Validator<Record<string, any>, false, any> =>
  pipe(
    ast,
    Match.value,
    Match.tag("TypeLiteral", ({ indexSignatures }) =>
      ReadonlyArray.isEmptyReadonlyArray(indexSignatures)
        ? Effect.succeed(go(ast))
        : Effect.fail(new IndexSignaturesAreNotSupportedError()),
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    Effect.runSync,
  );

// Helpers

const go = (ast: AST.AST): Validator<any, any, any> =>
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
        v.union(go(first), go(second), ...ReadonlyArray.map(rest, go)),
      ),
    ),
    Match.tag("TypeLiteral", (typeLiteral) => handleTypeLiteral(typeLiteral)),
    Match.tag("TupleType", ({ elements, rest }) => {
      const restValidator = pipe(rest, ReadonlyArray.head, Option.map(go));

      const [f, s, ...r] = elements;

      const elementToValidator = ({
        type,
        isOptional,
      }: AST.Element): Validator<any, any, any> =>
        isOptional ? v.optional(go(type)) : go(type);

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
                ...ReadonlyArray.map(r, elementToValidator),
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
    ReadonlyArray.head,
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
          new UnsupportedPropertySignatureKeyTypeError(typeofName),
        );
      } else {
        const validator = go(type);

        return Effect.succeed({
          propertyName: name,
          validator: isOptional ? v.optional(validator) : validator,
        });
      }
    }),
    Effect.flatMap((propertyNamesWithValidators) =>
      pipe(
        propertyNamesWithValidators,
        ReadonlyArray.reduce(
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

class TopLevelMustBeObjectError {
  readonly _tag = "TopLevelMustBeObjectError";
}

class UnsupportedPropertySignatureKeyTypeError {
  readonly _tag = "UnsupportedEffectSchemaTypeError";
  constructor(readonly keyType: string) {}
}

class EmptyTupleIsNotSupportedError {
  readonly _tag = "EmptyTupleIsNotSupportedError";
}

class UnsupportedEffectSchemaTypeError {
  readonly _tag = "UnsupportedEffectSchemaTypeError";
  constructor(readonly effectSchemaType: AST.AST["_tag"]) {}
}

class IndexSignaturesAreNotSupportedError {
  readonly _tag = "IndexSignaturesAreNotSupportedError";
}

const unsupportedEffectSchemaTypeError = ({ _tag }: AST.AST) =>
  Effect.fail(new UnsupportedEffectSchemaTypeError(_tag));

export default {
  args,
  table,
};
