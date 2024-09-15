import { Schema } from "@effect/schema";
import { Id } from "~/src/server/schemas/Id";

export const SystemFields = <TableName extends string>() =>
	Schema.Struct({
		_id: Id<TableName>(),
		_creationTime: Schema.Number,
	});

export const extendWithSystemFields = <
	TableName extends string,
	TableSchema extends Schema.Schema<any, any>,
>(
	_tableName: TableName,
	schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> =>
	Schema.extend(schema, SystemFields<TableName>());

export type ExtendWithSystemFields<
	TableName extends string,
	TableSchema extends Schema.Schema<any, any>,
> = Schema.extend<TableSchema, ReturnType<typeof SystemFields<TableName>>>;
