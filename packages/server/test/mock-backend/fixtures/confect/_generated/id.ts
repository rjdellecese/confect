import { GenericId } from "@confect/core";

export type TableNames = "events" | "notes" | "tags" | "users";

export const Id = <const TableName extends TableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
