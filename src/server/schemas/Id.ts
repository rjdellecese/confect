import { AST, Schema } from "@effect/schema";
import type { GenericId } from "convex/values";
import type { Option } from "effect";

const ConvexId = Symbol.for("ConvexId");

export const Id = <TableName extends string>(
	tableName: TableName,
): Schema.Schema<GenericId<TableName>> =>
	Schema.String.pipe(
		Schema.annotations({ [ConvexId]: tableName }),
	) as unknown as Schema.Schema<GenericId<TableName>>;

export const tableName = <TableName extends string>(
	ast: AST.AST,
): Option.Option<TableName> => AST.getAnnotation<TableName>(ConvexId)(ast);
