import { GenericId } from "@confect/core";
import type { SystemTableNames } from "convex/server";

export type TableNames = "orderedRows" | "transactionNotes";

export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName>;

export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
