import { GenericId } from "@confect/core";

export type TableNames = "notes" | "tags" | "users";

export const Id = <const TableName extends TableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
