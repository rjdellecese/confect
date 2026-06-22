import type {
  Expand,
  IdField,
  SystemFields as NonIdSystemFields,
} from "convex/server";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as GenericId from "./GenericId";

type SystemFieldsSchema<TableName extends string> = Schema.Struct<{
  _id: Schema.Schema<GenericId.GenericId<TableName>>;
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
 * Effect v4 has no general `Schema.extend`; the documented replacement is
 * `Schema.fieldsAssign` (a shortcut for `struct.mapFields(Struct.assign(...))`,
 * which preserves the struct's annotations). It applies to a `Struct`, so we
 * distribute it across the members of a `Union` for tables defined as a union
 * of variants.
 */
export const extendWithSystemFields = <
  TableName extends string,
  TableSchema extends Schema.Codec<any, any>,
>(
  tableName: TableName,
  schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> => {
  const system = SystemFields(tableName).fields;

  const extend = (s: Schema.Top): Schema.Top =>
    SchemaAST.isUnion(s.ast)
      ? Schema.Union(
          (s as unknown as Schema.Union<ReadonlyArray<Schema.Top>>).members.map(
            extend,
          ),
        )
      : Schema.fieldsAssign(system)(
          s as unknown as Schema.Struct<Schema.Struct.Fields>,
        );

  return extend(schema) as unknown as ExtendWithSystemFields<
    TableName,
    TableSchema
  >;
};

/**
 * Extend a table schema with Convex system fields at the type level.
 */
export type ExtendWithSystemFields<
  TableName extends string,
  TableSchema extends Schema.Codec<any, any>,
> = Schema.Codec<
  WithSystemFields<TableName, TableSchema["Type"]>,
  WithSystemFields<TableName, TableSchema["Encoded"]>
>;

export type WithSystemFields<TableName extends string, Document> = Expand<
  Readonly<IdField<TableName>> & Readonly<NonIdSystemFields> & Document
>;
