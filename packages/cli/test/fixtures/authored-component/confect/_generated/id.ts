import { GenericId, IdScope } from "@confect/core";

export const scope = IdScope.component("@confect-fixtures/counter:convex");
export const target = { kind: "component", scope } as const;
export type TableNames = "counters";

export const Id = <const TableName extends TableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName, scope);
