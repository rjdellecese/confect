import type {
  PropertyValidators,
  Validator,
  VObject,
  VUnion,
} from "convex/values";
import { Cause, Data, Effect, Exit, pipe, Schema } from "effect";

import { GenericId } from "@confect/core/GenericId";

// Type-level

export type ValidatorToValue<V extends Validator<any, any, any>> =
  V extends Validator<infer T, any, any> ? T : never;

// Compiler

export const compileValidator = <V extends Validator<any, "required", any>>(
  validator: V,
): Schema.Schema<ValidatorToValue<V>> =>
  runSyncThrow(compileValidatorEffect(validator)) as any;

export const compilePropertyValidators = (
  propertyValidators: PropertyValidators,
): Schema.Schema.AnyNoContext =>
  runSyncThrow(handleObject(propertyValidators));

export const compileTableValidator = <
  V extends VObject<any, any, any, any> | VUnion<any, any, any, any>,
>(
  validator: V,
): Schema.Schema<ValidatorToValue<V>> =>
  runSyncThrow(compileValidatorEffect(validator)) as any;

export const compileValidatorEffect = (
  validator: Validator<any, any, any>,
): Effect.Effect<Schema.Schema.AnyNoContext, UnsupportedValidatorKindError> => {
  switch (validator.kind) {
    case "string":
      return Effect.succeed(Schema.String);
    case "float64":
      return Effect.succeed(Schema.Number);
    case "int64":
      return Effect.succeed(Schema.BigIntFromSelf);
    case "boolean":
      return Effect.succeed(Schema.Boolean);
    case "null":
      return Effect.succeed(Schema.Null);
    case "any":
      return Effect.succeed(Schema.Any);
    case "bytes":
      return Effect.succeed(Schema.instanceOf(ArrayBuffer));
    case "id":
      return Effect.succeed(GenericId(validator.tableName));
    case "literal":
      return Effect.succeed(Schema.Literal(validator.value));
    case "array":
      return Effect.map(compileValidatorEffect(validator.element), (el) =>
        Schema.Array(el as Schema.Schema<any>),
      );
    case "object":
      return handleObject(validator.fields);
    case "union":
      return handleUnion(validator.members);
    case "record":
      return handleRecord(validator.key, validator.value);
    default:
      return Effect.fail(
        new UnsupportedValidatorKindError({
          kind: (validator as { kind: string }).kind,
        }),
      );
  }
};

const handleObject = (
  fields: Record<string, Validator<any, any, any>>,
): Effect.Effect<Schema.Schema.AnyNoContext, UnsupportedValidatorKindError> =>
  Effect.gen(function* () {
    const schemaFields: Record<string, any> = {};

    for (const [key, fieldValidator] of Object.entries(fields)) {
      const fieldSchema = yield* compileValidatorEffect(fieldValidator);
      schemaFields[key] =
        fieldValidator.isOptional === "optional"
          ? Schema.optionalWith(fieldSchema as Schema.Schema<any>, {
              exact: true,
            })
          : fieldSchema;
    }

    return Schema.Struct(
      schemaFields as Schema.Struct.Fields,
    ) as unknown as Schema.Schema.AnyNoContext;
  });

const handleUnion = (
  members: Validator<any, "required", any>[],
): Effect.Effect<Schema.Schema.AnyNoContext, UnsupportedValidatorKindError> =>
  Effect.gen(function* () {
    const schemas = yield* Effect.forEach(members, (m) =>
      compileValidatorEffect(m),
    );
    const [first, second, ...rest] = schemas as Schema.Schema<any>[];

    /* v8 ignore start */
    if (first === undefined || second === undefined) {
      return yield* Effect.dieMessage(
        "Union must have at least 2 members; this should be impossible.",
      );
    }
    /* v8 ignore stop */

    return Schema.Union(first, second, ...rest) as Schema.Schema.AnyNoContext;
  });

const handleRecord = (
  key: Validator<string, "required", any>,
  value: Validator<any, "required", any>,
): Effect.Effect<Schema.Schema.AnyNoContext, UnsupportedValidatorKindError> =>
  Effect.gen(function* () {
    const keySchema = yield* compileValidatorEffect(key);
    const valueSchema = yield* compileValidatorEffect(value);

    return Schema.Record({
      key: keySchema as Schema.Schema<string>,
      value: valueSchema as Schema.Schema<any>,
    }) as Schema.Schema.AnyNoContext;
  });

// Errors

const runSyncThrow = <A, E>(effect: Effect.Effect<A, E>) =>
  pipe(
    effect,
    Effect.runSyncExit,
    Exit.match({
      onSuccess: (value) => value,
      onFailure: (cause) => {
        throw Cause.squash(cause);
      },
    }),
  );

export class UnsupportedValidatorKindError extends Data.TaggedError(
  "UnsupportedValidatorKindError",
)<{
  readonly kind: string;
}> {
  /* v8 ignore start */
  override get message() {
    return `Unsupported validator kind '${this.kind}'`;
  }
  /* v8 ignore stop */
}
