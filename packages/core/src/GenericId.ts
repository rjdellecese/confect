/**
 * Implementation of the generated ID helper. Use `Id` from
 * `confect/_generated/id` rather than this package subpath.
 *
 * @module
 *
 * @internal
 */

import type { GenericId as ConvexGenericId } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

const ConvexId = "~@confect/core/ConvexId";

/**
 * Builds the schema behind the generated ID helper. Use `Id(tableName)` from
 * `confect/_generated/id` rather than calling this constructor directly.
 *
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
 * Codegen uses this to type document IDs. In application code, import `Id` from
 * `confect/_generated/id` and use `Id<TableName>`.
 *
 * @internal
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
