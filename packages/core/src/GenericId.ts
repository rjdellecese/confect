import type { GenericId as ConvexGenericId } from "convex/values";
import type { Option } from "effect";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

const ConvexId = Symbol.for("ConvexId");

export const GenericId = <TableName extends string>(
  tableName: TableName,
): Schema.Schema<ConvexGenericId<TableName>> =>
  Schema.String.pipe(
    Schema.annotations({ [ConvexId]: tableName }),
  ) as unknown as Schema.Schema<ConvexGenericId<TableName>>;

export type GenericId<TableName extends string> = ConvexGenericId<TableName>;

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  SchemaAST.getAnnotation<TableName>(ConvexId)(ast);
