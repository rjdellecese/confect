import type {
  Expand,
  IdField,
  SystemFields as NonIdSystemFields,
} from "convex/server";
import { Schema, type Struct as StructModule } from "effect";
import * as GenericId from "./GenericId";

type SystemFieldsSchema<TableName extends string> = Schema.Struct<{
  _id: Schema.Codec<
    GenericId.GenericId<TableName>,
    GenericId.GenericId<TableName>,
    never,
    never
  >;
  _creationTime: typeof Schema.Number;
}>;

/**
 * Produces a schema for Convex system fields.
 */
export const SystemFields = <TableName extends string>(
  tableName: TableName,
): SystemFieldsSchema<TableName> =>
  Schema.Struct({
    _id: GenericId.GenericId(tableName),
    _creationTime: Schema.Number,
  });

/**
 * Table schema bound: either a single struct or a union of structs.
 *
 * Convex tables can either be a single record shape (`Schema.Struct({...})`)
 * or a discriminated union of record shapes
 * (`Schema.Union([Schema.Struct({...}), Schema.Struct({...})])`).
 */
export type AnyTableSchema =
  | Schema.Struct<Schema.Struct.Fields>
  | Schema.Union<ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>>;

/**
 * Extend a table schema with Convex system fields.
 *
 * Effect 4 removed `Schema.extend`; struct fields are now merged via
 * `Schema.fieldsAssign`. For a `Schema.Struct`, we pipe through `fieldsAssign`.
 * For a `Schema.Union` of structs (polymorphic tables), we map each member
 * through the same transformation via `Union.mapMembers`.
 */
export const extendWithSystemFields = <
  TableName extends string,
  TableSchema extends Schema.Codec<any, any, never, never>,
>(
  tableName: TableName,
  schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> => {
  const systemFields = SystemFields(tableName).fields;
  // Heuristic: a Schema.Union exposes `.mapMembers`; a Schema.Struct does not.
  const maybeUnion = schema as unknown as {
    mapMembers?: (
      f: (
        members: ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>,
      ) => ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>,
    ) => unknown;
  };
  if (typeof maybeUnion.mapMembers === "function") {
    return maybeUnion.mapMembers((members) =>
      members.map((member) => member.pipe(Schema.fieldsAssign(systemFields))),
    ) as ExtendWithSystemFields<TableName, TableSchema>;
  }
  return (schema as unknown as Schema.Struct<Schema.Struct.Fields>).pipe(
    Schema.fieldsAssign(systemFields),
  ) as ExtendWithSystemFields<TableName, TableSchema>;
};

/**
 * Type-level counterpart to `extendWithSystemFields`. Handles both single-struct
 * and union-of-structs table schemas.
 */
export type ExtendWithSystemFields<
  TableName extends string,
  TableSchema extends Schema.Codec<any, any, never, never>,
> =
  TableSchema extends Schema.Union<
    infer Members extends ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>
  >
    ? Schema.Union<{
        [K in keyof Members]: Members[K] extends Schema.Struct<infer Fields>
          ? Schema.Struct<
              StructModule.Simplify<
                StructModule.Assign<
                  Fields,
                  SystemFieldsSchema<TableName>["fields"]
                >
              >
            >
          : never;
      }>
    : TableSchema extends Schema.Struct<infer Fields>
      ? Schema.Struct<
          StructModule.Simplify<
            StructModule.Assign<Fields, SystemFieldsSchema<TableName>["fields"]>
          >
        >
      : // Fallback: when TableSchema is the broad `Codec<any, any, never, never>` bound
        // (e.g. inside `Table.AnyWithProps` / `WithName` value-level usages), we don't
        // know the precise table shape. Returning `Schema.Codec<any, any, never, never>`
        // (rather than `never`) keeps the Table type assignable in those positions.
        Schema.Codec<any, any, never, never>;

export type WithSystemFields<TableName extends string, Document> = Expand<
  Readonly<IdField<TableName>> & Readonly<NonIdSystemFields> & Document
>;
