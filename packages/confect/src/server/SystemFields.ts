import { GenericId } from "@rjdellecese/confect/api";
import type {
  Expand,
  IdField,
  SystemFields as NonIdSystemFields,
} from "convex/server";
import { Schema } from "effect";

type SystemFieldsSchema<TableName extends string> = Schema.Struct<{
  _id: Schema.Schema<
    GenericId.GenericId<TableName>,
    GenericId.GenericId<TableName>,
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
 */
export const extendWithSystemFields = <
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
>(
  tableName: TableName,
  schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> =>
  Schema.extend(SystemFields(tableName), schema);

/**
 * Extend a table schema with Convex system fields at the type level.
 */
export type ExtendWithSystemFields<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = Schema.extend<SystemFieldsSchema<TableName>, TableSchema>;

export type WithSystemFields<TableName extends string, Document> = Expand<
  Readonly<IdField<TableName>> & Readonly<NonIdSystemFields> & Document
>;
