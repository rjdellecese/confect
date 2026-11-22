import * as GenericId from "@confect/core/GenericId";
import type { SystemTableNames } from "convex/server";
import type tableNames from "./tableNames.js";

/**
 * Union of application table names, excluding Convex system tables. If the
 * application declares no tables, the type is `never`.
 *
 * @category models
 */
export type TableNames = (typeof tableNames)[number];

/**
 * Convex document ID branded with its application or system table name. The brand
 * distinguishes IDs in TypeScript; it does not prove a document exists.
 *
 * @category models
 */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName>;

/**
 * Creates an Effect schema for a table's document IDs without importing the table.
 *
 * **Gotchas**
 *
 * Decoding accepts any string. It does not check the ID's format, table
 * membership, or existence. Use the generated `DocumentIds` service in queries or
 * mutations to validate table membership.
 *
 * @param tableName - An application or Convex system table name.
 * @returns A schema whose decoded and encoded types are `Id<TableName>`.
 * @category schemas
 */
export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
