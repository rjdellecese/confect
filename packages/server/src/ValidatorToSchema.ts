import type { Infer, Validator, VObject, VUnion } from "convex/values";
import { Cause, Data, Effect, Exit, Match, pipe, Schema } from "effect";

import { GenericId } from "@confect/core/GenericId";

// Compiler

export const compileValidator = <V extends Validator<any, "required", any>>(
  validator: V,
): Schema.Schema<Infer<V>> =>
  runSyncThrow(compileValidatorEffect(validator)) as any;

export const compileTableValidator = <
  V extends VObject<any, any, any, any> | VUnion<any, any, any, any>,
>(
  validator: V,
): Schema.Schema<Infer<V>> =>
  runSyncThrow(compileValidatorEffect(validator)) as any;

const kind = Match.discriminator("kind");

const compileValidatorEffect = (
  validator: Validator<any, any, any>,
): Effect.Effect<Schema.Schema.AnyNoContext, UnsupportedValidatorKindError> =>
  pipe(
    validator,
    Match.value,
    kind("string", () => Effect.succeed(Schema.String)),
    kind("float64", () => Effect.succeed(Schema.Number)),
    kind("int64", () => Effect.succeed(Schema.BigIntFromSelf)),
    kind("boolean", () => Effect.succeed(Schema.Boolean)),
    kind("null", () => Effect.succeed(Schema.Null)),
    kind("any", () => Effect.succeed(Schema.Any)),
    kind("bytes", () => Effect.succeed(Schema.instanceOf(ArrayBuffer))),
    kind("id", ({ tableName }) => Effect.succeed(GenericId(tableName))),
    kind("literal", ({ value }) => Effect.succeed(Schema.Literal(value))),
    kind("array", ({ element }) =>
      Effect.map(compileValidatorEffect(element), (el) =>
        Schema.Array(el as Schema.Schema.Any),
      ),
    ),
    kind("object", ({ fields }) => handleObject(fields)),
    kind("union", ({ members }) => handleUnion(members)),
    kind("record", ({ key, value }) => handleRecord(key, value)),
    Match.orElse((v) =>
      Effect.fail(
        new UnsupportedValidatorKindError({
          kind: (v as { kind: string }).kind,
        }),
      ),
    ),
  );

const handleObject = (
  fields: Record<string, Validator<any, any, any>>,
): Effect.Effect<Schema.Schema.AnyNoContext, UnsupportedValidatorKindError> =>
  Effect.gen(function* () {
    const schemaFields: Record<string, any> = {};

    for (const [key, fieldValidator] of Object.entries(fields)) {
      const fieldSchema = yield* compileValidatorEffect(fieldValidator);
      schemaFields[key] =
        fieldValidator.isOptional === "optional"
          ? Schema.optionalWith(fieldSchema as Schema.Schema.Any, {
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
    const [first, second, ...rest] = schemas as Schema.Schema.Any[];

    /* v8 ignore start */
    if (first === undefined || second === undefined) {
      return yield* Effect.dieMessage(
        "Union must have at least 2 members; this should be impossible.",
      );
    }
    /* v8 ignore stop */

    return Schema.Union(
      first,
      second,
      ...rest,
    ) as unknown as Schema.Schema.AnyNoContext;
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
      value: valueSchema as Schema.Schema.Any,
    }) as unknown as Schema.Schema.AnyNoContext;
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
