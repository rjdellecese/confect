import { GenericId } from "@confect/core";
import type { SystemTableNames } from "convex/server";
import type { tableNames } from "./tableNames";

export type TableNames = (typeof tableNames)[number];

export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName>;

export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
