import type { GenericId as ConvexGenericId } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

const ConvexId = "~@confect/core/ConvexId";

export const GenericId = <TableName extends string>(
  tableName: TableName,
): Schema.Codec<ConvexGenericId<TableName>> =>
  Schema.String.annotate({
    [ConvexId]: tableName,
  }) as unknown as Schema.Codec<ConvexGenericId<TableName>>;

export type GenericId<TableName extends string> = ConvexGenericId<TableName>;

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(SchemaAST.resolveAt<TableName>(ConvexId)(ast));
