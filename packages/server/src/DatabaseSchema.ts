import * as Predicate from "effect/Predicate";
import type { GenericDataModel, TableNamesInDataModel } from "convex/server";
import type * as Table from "./Table";

/**
 * @internal
 */
export const TypeId = "~@confect/server/DatabaseSchema";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export interface Any {
  readonly [TypeId]: unknown;
}

/**
 * @internal
 */
export const isDatabaseSchema = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * The application's registry of bound table handles, exported as the default
 * from `_generated/schema`. Assembling the registry does not evaluate table
 * schemas or construct Convex deployment validators.
 *
 * Use a type-only import for the database model. A value import brings in every
 * application table module; handlers that need individual tables should import
 * their handles from `_generated/tables/<name>` instead. The separate
 * `_generated/convexSchema` export is the Convex schema for deployment and test
 * setup.
 *
 * @category Models
 */
export interface DatabaseSchema<
  Tables_ extends Readonly<Record<string, Table.AnyWithProps>> = {},
> {
  readonly [TypeId]: Readonly<Tables_>;
}

/**
 * @internal
 */
export interface AnyWithProps extends DatabaseSchema<
  Readonly<Record<string, Table.AnyWithProps>>
> {}

/**
 * @internal
 */
export type FromConvexDataModel<Model extends GenericDataModel> =
  DatabaseSchema<{
    readonly [Name in TableNamesInDataModel<Model>]: Omit<
      Table.AnyWithProps,
      "tableName"
    > & { readonly tableName: Name };
  }>;

/**
 * @internal
 */
export type Tables<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_[TypeId][keyof DatabaseSchema_[TypeId]];

/**
 * Look up bound application table handles by name. Use this when a tool needs
 * the full registry; if only the names are needed, default-import
 * `_generated/tableNames` to avoid loading the table modules.
 *
 * @category Getters
 *
 * @param self - The application registry from `_generated/schema`.
 *
 * @returns Its readonly record of application table handles, without evaluating
 *   their codecs. The two system tables are not part of the generated
 *   registry.
 */
export const tables = <DatabaseSchema_ extends AnyWithProps>(
  self: DatabaseSchema_,
): DatabaseSchema_[TypeId] => self[TypeId];

/**
 * @internal
 */
export type TableNames<DatabaseSchema_ extends AnyWithProps> = Table.Name<
  Tables<DatabaseSchema_>
> &
  string;

/**
 * @internal
 */
export type SystemTableNames = Table.Name<Table.SystemTables>;

/**
 * @internal
 */
export type AllTableNames<DatabaseSchema_ extends AnyWithProps> =
  | TableNames<DatabaseSchema_>
  | SystemTableNames;

/**
 * @internal
 */
export type TableWithName<
  DatabaseSchema_ extends AnyWithProps,
  TableName extends TableNames<DatabaseSchema_>,
> = Extract<Tables<DatabaseSchema_>, { readonly tableName: TableName }>;

/**
 * Construct a database schema from its bound table record. The record's keys
 * must match their tables' names. Table schemas remain lazy; construction only
 * stores the record. The empty case is `make({})`.
 *
 * @internal
 */
export const make = <
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(
  tableRecord: TablesRecord,
): DatabaseSchema<TablesRecord> => ({ [TypeId]: tableRecord });
