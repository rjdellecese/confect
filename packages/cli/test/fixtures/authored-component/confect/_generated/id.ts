import * as GenericId from "@confect/core/GenericId";
import * as IdScope from "@confect/core/IdScope";
import type { SystemTableNames } from "convex/server";
import type tableNames from "./tableNames.js";

export const scope = IdScope.component("@confect-fixtures/counter:convex");
export const target = { kind: "component", scope } as const;

export type TableNames = (typeof tableNames)[number];

export type Id<TableName extends TableNames | SystemTableNames> = GenericId.GenericId<TableName, typeof scope>;

export const Id = <const TableName extends TableNames | SystemTableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName, scope);
