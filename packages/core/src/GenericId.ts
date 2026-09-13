import type { GenericId as ConvexGenericId } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

const ConvexId = "~@confect/core/ConvexId";

export const GenericId = <TableName extends string>(
  tableName: TableName,
): Schema.Codec<ConvexGenericId<TableName>> =>
  // SAFETY: Convex IDs are strings with a phantom table-name brand. The annotation records the table for validator generation without changing string encoding or decoding.
  Schema.String.annotate({
    [ConvexId]: tableName,
  }) as Schema.Codec<ConvexGenericId<TableName>>;

export type GenericId<TableName extends string> = ConvexGenericId<TableName>;

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(SchemaAST.resolveAt<TableName>(ConvexId)(ast));
