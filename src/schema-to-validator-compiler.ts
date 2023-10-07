import * as Match from "@effect/match";
import type * as AST from "@effect/schema/AST";
import * as Schema from "@effect/schema/Schema";
import type { Validator } from "convex/values";
import { v } from "convex/values";
import { Effect, Option, pipe, ReadonlyArray } from "effect";

export const args = <DatabaseValue, TypeScriptValue = DatabaseValue>(
  schema: Schema.Schema<DatabaseValue, TypeScriptValue>
): Record<string, Validator<any, any, any>> => go(Schema.from(schema).ast);

const go = (ast: AST.AST): Record<string, Validator<any, any, any>> =>
  pipe(
    ast,
    Match.value,
    Match.tag("TypeLiteral", ({ indexSignatures, propertySignatures }) =>
      ReadonlyArray.isEmptyReadonlyArray(indexSignatures)
        ? handlePropertySignatures(propertySignatures)
        : Effect.fail(new TopLevelObjectMayNotHaveIndexSignaturesError())
    ),
    Match.orElse(() => Effect.fail(new TopLevelMustBeObjectError())),
    Effect.runSync
  );

const goAgain = (ast: AST.AST): Validator<any, any, any> =>
  pipe(
    ast,
    Match.value,
    Match.tag("Declaration", ({ type }) => Effect.succeed(goAgain(type))),
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
        v.union(
          goAgain(first),
          goAgain(second),
          ...ReadonlyArray.map(rest, goAgain)
        )
      )
    ),
    Match.tag("TypeLiteral", (typeLiteral) => handleTypeLiteral(typeLiteral)),
    Match.tag("Tuple", ({ elements, rest }) => {
      const restValidator = pipe(
        rest,
        Option.map((restHead) =>
          pipe(restHead, ReadonlyArray.headNonEmpty, goAgain)
        )
      );

      const [f, s, ...r] = elements;

      const elementToValidator = ({
        type,
        isOptional,
      }: AST.Element): Validator<any, any, any> =>
        isOptional ? v.optional(goAgain(type)) : goAgain(type);

      const arrayItemsValidator: Effect.Effect<
        never,
        EmptyTupleIsNotSupportedError,
        Validator<any, any, any>
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
      "UniqueSymbol",
      "SymbolKeyword",
      "UndefinedKeyword",
      "VoidKeyword",
      "NeverKeyword",
      "Enums",
      "TemplateLiteral",
      "ObjectKeyword",
      "Lazy",
      "Transform",
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
    ReadonlyArray.head,
    Option.match({
      onNone: () =>
        pipe(
          propertySignatures,
          handlePropertySignatures,
          Effect.map(v.object)
        ),
      onSome: (indexSignature) =>
        pipe(
          ReadonlyArray.length(indexSignatures) > 1
            ? Effect.fail(new MultipleIndexSignaturesAreNotSupportedError())
            : handleIndexSignature(indexSignature)
        ),
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
          new UnsupportedPropertySignatureKeyTypeError(typeofName)
        );
      } else {
        const validator = goAgain(type);

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
          })
        ),
        Effect.succeed
      )
    )
  );

const handleIndexSignature = ({ parameter, type }: AST.IndexSignature) =>
  parameter._tag === "StringKeyword"
    ? Effect.succeed(v.record(v.string(), goAgain(type)))
    : Effect.fail(
        new UnsupportedIndexSignatureParameterTypeError(parameter._tag)
      );

class TopLevelObjectMayNotHaveIndexSignaturesError {
  readonly _tag = "TopLevelObjectMayNotHaveIndexSignaturesError";
}

class TopLevelMustBeObjectError {
  readonly _tag = "TopLevelMustBeObjectError";
}

class MultipleIndexSignaturesAreNotSupportedError {
  readonly _tag = "MultipleIndexSignaturesAreNotSupportedError";
}

class UnsupportedPropertySignatureKeyTypeError {
  readonly _tag = "UnsupportedEffectSchemaTypeError";
  constructor(readonly keyType: string) {}
}

class UnsupportedIndexSignatureParameterTypeError {
  readonly _tag = "UnsupportedIndexSignatureParameterTypeError";
  constructor(readonly keyType: string) {}
}

class EmptyTupleIsNotSupportedError {
  readonly _tag = "EmptyTupleIsNotSupportedError";
}

class UnsupportedEffectSchemaTypeError {
  readonly _tag = "UnsupportedEffectSchemaTypeError";
  constructor(readonly effectSchemaType: AST.AST["_tag"]) {}
}

const unsupportedEffectSchemaTypeError = ({ _tag }: AST.AST) =>
  Effect.fail(new UnsupportedEffectSchemaTypeError(_tag));

export default {
  args,
};
