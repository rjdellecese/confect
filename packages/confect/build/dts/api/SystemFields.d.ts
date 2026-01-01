import { GenericId } from "./GenericId.js";
import { Schema } from "effect";
import { Expand, IdField, SystemFields as SystemFields$1 } from "convex/server";

//#region src/api/SystemFields.d.ts
declare namespace SystemFields_d_exports {
  export { ExtendWithSystemFields, SystemFields, WithSystemFields, extendWithSystemFields };
}
type SystemFieldsSchema<TableName extends string> = Schema.Struct<{
  _id: Schema.Schema<GenericId<TableName>, GenericId<TableName>, never>;
  _creationTime: typeof Schema.Number;
}>;
/**
 * Produces a schema for Convex system fields.
 */
declare const SystemFields: <TableName extends string>(tableName: TableName) => SystemFieldsSchema<TableName>;
/**
 * Extend a table schema with Convex system fields.
 */
declare const extendWithSystemFields: <TableName extends string, TableSchema extends Schema.Schema.AnyNoContext>(tableName: TableName, schema: TableSchema) => ExtendWithSystemFields<TableName, TableSchema>;
/**
 * Extend a table schema with Convex system fields at the type level.
 */
type ExtendWithSystemFields<TableName extends string, TableSchema extends Schema.Schema.AnyNoContext> = Schema.extend<SystemFieldsSchema<TableName>, TableSchema>;
type WithSystemFields<TableName extends string, Document> = Expand<Readonly<IdField<TableName>> & Readonly<SystemFields$1> & Document>;
//#endregion
export { ExtendWithSystemFields, SystemFields, SystemFields_d_exports, WithSystemFields, extendWithSystemFields };
//# sourceMappingURL=SystemFields.d.ts.map