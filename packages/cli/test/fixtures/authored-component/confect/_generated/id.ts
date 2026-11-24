import * as GenericId from "@confect/core/GenericId";
import * as IdScope from "@confect/core/IdScope";
import type { SystemTableNames } from "convex/server";
import type tableNames from "./tableNames.js";

/**
 * Definition scope shared by IDs declared in this component. Pass it as
 * `parentScope` when binding a child component, or to `Table.systemTablesForScope`
 * to access this component's system tables.
 *
 * @category constants
 */
export const scope = IdScope.component("@confect-fixtures/counter:convex");

/**
 * Execution target for this component. Pass it to `HttpRouter.forSchema` with
 * the generated schema type to provide component-scoped services to HTTP routes
 * without importing the table registry at runtime.
 *
 * @category configuration
 */
export const target = { kind: "component", scope } as const;

/**
 * Union of component table names, excluding Convex system tables. If the
 * component declares no tables, the type is `never`.
 *
 * @category models
 */
export type TableNames = (typeof tableNames)[number];

/**
 * Convex document ID branded with its table name and component definition scope.
 * Binding a contract rebases IDs owned by this definition to the installed
 * instance without changing the underlying strings.
 *
 * @category models
 */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName, typeof scope>;

/**
 * Creates an Effect schema for a table's document IDs without importing the table.
 *
 * **Gotchas**
 *
 * Decoding accepts any string. It does not check the ID's format, table
 * membership, or existence. Use the generated `DocumentIds` service in queries or
 * mutations to validate table membership.
 *
 * @param tableName - A component or Convex system table name.
 * @returns A schema whose decoded and encoded types are `Id<TableName>`.
 * @category schemas
 */
export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName, scope);
