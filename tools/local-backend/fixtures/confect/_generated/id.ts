import { GenericId } from "@confect/core";
import type { SystemTableNames } from "convex/server";

/**
 * Application table names; excludes system tables and is never when no tables exist.
 * @category Models
 */
export type TableNames = "httpVectors" | "transactionNotes";

/**
 * A Convex document ID branded with its application or system table name.
 * @category Schemas
 */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName>;

/**
 * Creates an Effect schema for a document ID without importing the referenced table.
 * Decoding accepts strings; it does not verify the ID's format, table membership, or existence.
 * Use DocumentIds in queries or mutations to validate table membership.
 *
 * @param tableName - An application or Convex system table name.
 * @returns A schema whose decoded and encoded types are Id<TableName>.
 * @category Schemas
 */
export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
