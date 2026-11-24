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
 * Registry of bound application tables, default-exported from
 * `_generated/schema`. Assembling it does not evaluate table codecs or
 * construct Convex deployment validators.
 *
 * For an application-wide annotation, use `typeof schema` with a type-only
 * default import from `confect/_generated/schema`. Use an explicit table record
 * when describing a subset.
 *
 * **Gotchas**
 *
 * A value import loads every application table module. Use a type-only import
 * for a model annotation and import individual handles from
 * `_generated/tables/<name>` in handlers. `_generated/convexSchema` supplies
 * the separate Convex schema for deployment and test setup.
 *
 * @category Models
 */
export interface DatabaseSchema<
  Tables_ extends Readonly<Record<string, Table.AnyWithProps>> = Record<
    never,
    Table.AnyWithProps
  >,
> {
  readonly [TypeId]: Readonly<Tables_>;
}

/**
 * @internal
 */
export type AnyWithProps = DatabaseSchema<
  Readonly<Record<string, Table.AnyWithProps>>
>;

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
 * Returns the registry's bound application tables by name without evaluating
 * their codecs.
 *
 * **When to use**
 *
 * Use when inspecting the handles for all application tables. For a list of
 * names alone, default-import `_generated/tableNames` to avoid loading the
 * table modules.
 *
 * @category Getters
 *
 * @param self - The application registry from `_generated/schema`.
 *
 * @returns A readonly record keyed by application table name. The system tables
 *   are not part of this record.
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
 * Builds the registry exported by codegen without evaluating table codecs. For
 * the application registry, default-import `confect/_generated/schema` rather
 * than constructing it directly.
 *
 * @internal
 */
export const make = <
  const TablesRecord extends Readonly<Record<string, Table.AnyWithProps>>,
>(
  tableRecord: TablesRecord,
): DatabaseSchema<TablesRecord> => ({ [TypeId]: tableRecord });
