import type { GenericId as ConvexGenericId } from "convex/values";
import { Option, Schema, SchemaAST } from "effect";

const ConvexIdKey = "@confect/core/ConvexId";

export const GenericId = <TableName extends string>(
  tableName: TableName,
): Schema.Codec<
  ConvexGenericId<TableName>,
  ConvexGenericId<TableName>,
  never,
  never
> =>
  Schema.String.pipe(
    Schema.annotate({ [ConvexIdKey]: tableName }),
  ) as unknown as Schema.Codec<
    ConvexGenericId<TableName>,
    ConvexGenericId<TableName>,
    never,
    never
  >;

export type GenericId<TableName extends string> = ConvexGenericId<TableName>;

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(SchemaAST.resolveAt<TableName>(ConvexIdKey)(ast));
