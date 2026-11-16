import type { GenericId as ConvexGenericId } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

const ConvexId = "~@confect/core/ConvexId";

/**
 * @internal
 */
export const GenericId = <TableName extends string>(
  tableName: TableName,
): Schema.toType<Schema.refine<ConvexGenericId<TableName>, Schema.String>> =>
  Schema.String.annotate({ [ConvexId]: tableName }).pipe(
    Schema.refine((_value): _value is ConvexGenericId<TableName> => true),
    Schema.toType,
  );

/**
 * A Convex document identifier branded with its table name. The generated
 * `Id<TableName>` type aliases this contract. The brand distinguishes IDs from
 * different tables at compile time; it does not prove that a document exists.
 */
export type GenericId<TableName extends string> = ConvexGenericId<TableName>;

/**
 * @internal
 */
export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(
    (ast.annotations?.[ConvexId] as TableName | undefined) ??
      SchemaAST.resolveAt<TableName>(ConvexId)(ast),
  );
