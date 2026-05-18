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
    string,
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
 * Extend a table schema with Convex system fields.
 *
 * In Effect 4, `Schema.extend` was removed; struct fields are now merged via
 * `Schema.fieldsAssign`. Table schemas are constrained to `Schema.Struct`
 * (not arbitrary Codec) so the merge is type-safe.
 */
export const extendWithSystemFields = <
  TableName extends string,
  TableSchema extends Schema.Struct<Schema.Struct.Fields>,
>(
  tableName: TableName,
  schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> =>
  schema.pipe(
    Schema.fieldsAssign(SystemFields(tableName).fields),
  ) as ExtendWithSystemFields<TableName, TableSchema>;

/**
 * Extend a table schema with Convex system fields at the type level.
 */
export type ExtendWithSystemFields<
  TableName extends string,
  TableSchema extends Schema.Struct<Schema.Struct.Fields>,
> = TableSchema extends Schema.Struct<infer Fields>
  ? Schema.Struct<
      StructModule.Simplify<
        StructModule.Assign<
          Fields,
          SystemFieldsSchema<TableName>["fields"]
        >
      >
    >
  : never;

export type WithSystemFields<TableName extends string, Document> = Expand<
  Readonly<IdField<TableName>> & Readonly<NonIdSystemFields> & Document
>;
