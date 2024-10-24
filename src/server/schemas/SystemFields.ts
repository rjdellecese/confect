import { Schema } from "effect";
import { Id } from "~/src/server/schemas/Id";

export const SystemFields = <TableName extends string>(tableName: TableName) =>
	Schema.Struct({
		_id: Id(tableName),
		_creationTime: Schema.Number,
	});

export const extendWithSystemFields = <
	TableName extends string,
	TableSchema extends Schema.Schema.AnyNoContext,
>(
	_tableName: TableName,
	schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> =>
	Schema.extend(schema, SystemFields(_tableName));

export type ExtendWithSystemFields<
	TableName extends string,
	TableSchema extends Schema.Schema.AnyNoContext,
> = Schema.extend<TableSchema, ReturnType<typeof SystemFields<TableName>>>;
