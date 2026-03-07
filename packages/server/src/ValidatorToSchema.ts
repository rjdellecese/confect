import type { Infer, Validator, VObject, VUnion } from "convex/values";
import { Match, pipe, Schema } from "effect";

import { GenericId } from "@confect/core/GenericId";

// Compiler

export const compileValidator = <V extends Validator<any, "required", any>>(
  validator: V,
): Schema.Schema<Infer<V>> => compile(validator) as any;

export const compileTableValidator = <
  V extends VObject<any, any, any, any> | VUnion<any, any, any, any>,
>(
  validator: V,
): Schema.Schema<Infer<V>> => compile(validator) as any;

const kind = Match.discriminator("kind");

const compile = (validator: Validator<any, any, any>): Schema.Schema.Any =>
  pipe(
    validator,
    Match.value,
    kind("string", () => Schema.String),
    kind("float64", () => Schema.Number),
    kind("int64", () => Schema.BigIntFromSelf),
    kind("boolean", () => Schema.Boolean),
    kind("null", () => Schema.Null),
    kind("any", () => Schema.Any),
    kind("bytes", () => Schema.instanceOf(ArrayBuffer)),
    kind("id", ({ tableName }) => GenericId(tableName)),
    kind("literal", ({ value }) => Schema.Literal(value)),
    kind("array", ({ element }) =>
      Schema.Array(compile(element) as Schema.Schema.Any),
    ),
    kind("object", ({ fields }) => handleObject(fields)),
    kind("union", ({ members }) => handleUnion(members)),
    kind("record", ({ key, value }) => handleRecord(key, value)),
    Match.exhaustive,
  );

const handleObject = (fields: Record<string, Validator<any, any, any>>) => {
  const schemaFields: Record<string, any> = {};

  for (const [key, fieldValidator] of Object.entries(fields)) {
    const fieldSchema = compile(fieldValidator);
    schemaFields[key] =
      fieldValidator.isOptional === "optional"
        ? Schema.optionalWith(fieldSchema as Schema.Schema.Any, {
            exact: true,
          })
        : fieldSchema;
  }

  return Schema.Struct(schemaFields as Schema.Struct.Fields);
};

const handleUnion = (members: Validator<any, "required", any>[]) => {
  const schemas = members.map((m) => compile(m)) as Schema.Schema.Any[];
  const [first, second, ...rest] = schemas;

  /* v8 ignore start */
  if (first === undefined || second === undefined) {
    throw new Error(
      "Union must have at least 2 members; this should be impossible.",
    );
  }
  /* v8 ignore stop */

  return Schema.Union(first, second, ...rest);
};

const handleRecord = (
  key: Validator<string, "required", any>,
  value: Validator<any, "required", any>,
) => {
  const keySchema = compile(key);
  const valueSchema = compile(value);

  return Schema.Record({
    key: keySchema as Schema.Schema<string>,
    value: valueSchema as Schema.Schema.Any,
  });
};
