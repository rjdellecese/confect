import type { GenericId as ConvexGenericId } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

const ConvexId = "~@confect/core/ConvexId";

export const GenericId = <TableName extends string>(
  tableName: TableName,
): Schema.toType<Schema.refine<ConvexGenericId<TableName>, Schema.String>> =>
  Schema.String.annotate({ [ConvexId]: tableName }).pipe(
    Schema.refine((_value): _value is ConvexGenericId<TableName> => true),
    Schema.toType,
  );

export type GenericId<TableName extends string> = ConvexGenericId<TableName>;

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(
    (ast.annotations?.[ConvexId] as TableName | undefined) ??
      SchemaAST.resolveAt<TableName>(ConvexId)(ast),
  );
