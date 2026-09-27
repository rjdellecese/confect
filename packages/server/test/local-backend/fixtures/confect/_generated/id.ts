import { GenericId } from "@confect/core";

export type TableNames = "transactionNotes";

export const Id = <const TableName extends TableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
