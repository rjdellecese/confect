import type { GenericId as ConvexGenericId } from "convex/values";
import * as Array from "effect/Array";
import { memoize } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as IdScope from "./IdScope";

const ConvexId = "~@confect/core/ConvexId";
const ConvexIdScope = "~@confect/core/ConvexIdScope";

/**
 * Scoping changes only the TypeScript identity, never the stored string. The
 * qualified table brand prevents a component ID from also being assignable to
 * a vanilla application ID with the same table name.
 */
export type GenericId<
  TableName extends string,
  Scope extends IdScope.IdScope = IdScope.App,
> = Scope extends IdScope.App
  ? ConvexGenericId<TableName>
  : ConvexGenericId<`@confect(${Scope})/${TableName}`> & {
      readonly "~@confect/core/ScopedId": {
        readonly table: TableName;
        readonly scope: Scope;
      };
    };

export const GenericId = <
  TableName extends string,
  const Scope extends IdScope.IdScope = IdScope.App,
>(
  tableName: TableName,
  scope?: Scope,
): Schema.Codec<GenericId<TableName, Scope>> =>
  Schema.String.annotate({
    [ConvexId]: tableName,
    [ConvexIdScope]: scope ?? IdScope.app,
  }) as unknown as Schema.Codec<GenericId<TableName, Scope>>;

export const scope = (ast: SchemaAST.AST): IdScope.IdScope =>
  SchemaAST.resolveAt<IdScope.IdScope>(ConvexIdScope)(ast) ?? IdScope.app;

/** Rebind only IDs owned by `From`; IDs belonging to other scopes survive. */
export type Rebase<
  A,
  From extends IdScope.IdScope,
  To extends IdScope.IdScope,
> = A extends {
  readonly "~@confect/core/ScopedId": {
    readonly table: infer Table extends string;
    readonly scope: infer Scope extends IdScope.IdScope;
  };
}
  ? GenericId<Table, IdScope.Rebase<Scope, From, To>>
  : A extends ConvexGenericId<infer Table>
    ? From extends IdScope.App
      ? GenericId<Table, To>
      : A
    : A extends
          | string
          | number
          | boolean
          | bigint
          | symbol
          | null
          | undefined
          | Date
          | URL
          | ArrayBuffer
          | RegExp
          | ((...args: never[]) => unknown)
      ? A
      : A extends object
        ? { [K in keyof A]: Rebase<A[K], From, To> }
        : A;

/**
 * Scope annotations belong to both sides of a codec. Keep its transformations,
 * checks, optional fields and declaration parsers intact while rebinding IDs.
 */
export const rebase = <
  Schema_ extends Schema.ConstraintCodec<any, any, never, never>,
  const From extends IdScope.IdScope,
  const To extends IdScope.IdScope,
>(
  schema: Schema_,
  from: From,
  to: To,
): Schema.Codec<
  Rebase<Schema_["Type"], From, To>,
  Rebase<Schema_["Encoded"], From, To>
> => {
  const visit = memoize((ast: SchemaAST.AST): SchemaAST.AST => {
    const next = Match.value(ast).pipe(
      Match.tag(
        "Objects",
        (objects) =>
          new SchemaAST.Objects(
            Array.map(
              objects.propertySignatures,
              (property) =>
                new SchemaAST.PropertySignature(
                  property.name,
                  visit(property.type),
                ),
            ),
            Array.map(
              objects.indexSignatures,
              (index) =>
                new SchemaAST.IndexSignature(
                  visit(index.parameter),
                  visit(index.type),
                ),
            ),
            objects.annotations,
            objects.checks,
            undefined,
            objects.context,
            objects.encodingChecks,
          ),
      ),
      Match.tag(
        "Arrays",
        (arrays) =>
          new SchemaAST.Arrays(
            arrays.isMutable,
            Array.map(arrays.elements, visit),
            Array.map(arrays.rest, visit),
            arrays.annotations,
            arrays.checks,
            undefined,
            arrays.context,
            arrays.encodingChecks,
          ),
      ),
      Match.tag(
        "Union",
        (union) =>
          new SchemaAST.Union(
            Array.map(union.types, visit),
            union.mode,
            union.annotations,
            union.checks,
            undefined,
            union.context,
            union.encodingChecks,
          ),
      ),
      Match.tag(
        "Suspend",
        (suspend) =>
          new SchemaAST.Suspend(
            () => visit(suspend.thunk()),
            suspend.annotations,
            suspend.checks,
            undefined,
            suspend.context,
          ),
      ),
      Match.tag(
        "Declaration",
        (declaration) =>
          new SchemaAST.Declaration(
            Array.map(declaration.typeParameters, visit),
            declaration.run,
            declaration.annotations,
            declaration.checks,
            undefined,
            declaration.context,
            declaration.encodingChecks,
            declaration.encodingRun,
          ),
      ),
      Match.tag(
        "Null",
        "Undefined",
        "Void",
        "Never",
        "Unknown",
        "Any",
        "String",
        "Number",
        "Boolean",
        "BigInt",
        "Symbol",
        "Literal",
        "UniqueSymbol",
        "ObjectKeyword",
        "Enum",
        "TemplateLiteral",
        (leaf) => leaf,
      ),
      Match.exhaustive,
    );
    const ownScope = scope(ast);
    const scoped =
      Option.isSome(tableName(ast)) &&
      (ownScope === from || ownScope.startsWith(`${from}/instance:`))
        ? Schema.make<Schema.Codec<unknown>>(next).annotate({
            [ConvexIdScope]: to + ownScope.slice(from.length),
          }).ast
        : next;
    if (ast.encoding === undefined) return scoped;
    // Effect's replaceEncoding helper is internal and omitted from its published
    // declarations. Preserve AST prototypes and descriptors at this boundary;
    // spreading the node itself would lose its class behavior.
    return Object.create(Object.getPrototypeOf(scoped), {
      ...Object.getOwnPropertyDescriptors(scoped),
      encoding: {
        value: Array.map(
          ast.encoding,
          (link) => new SchemaAST.Link(visit(link.to), link.transformation),
        ),
        enumerable: true,
        configurable: true,
        writable: true,
      },
    }) as SchemaAST.AST;
  });
  return Schema.make(visit(schema.ast));
};

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(SchemaAST.resolveAt<TableName>(ConvexId)(ast));
