import type { GenericId as ConvexGenericId } from "convex/values";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import type * as IdScope from "./IdScope";

const ConvexId = "~@confect/core/ConvexId";
const ConvexIdScope = "~@confect/core/ConvexIdScope";

/**
 * Scoping changes only the TypeScript identity, never the stored string. The
 * qualified table brand prevents a component ID from also being assignable to
 * a vanilla application ID with the same table name.
 */
export type GenericId<
  TableName extends string,
  Scope extends string = IdScope.App,
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
  const Scope extends string = IdScope.App,
>(
  tableName: TableName,
  scope?: Scope,
): Schema.Codec<GenericId<TableName, Scope>> =>
  Schema.String.annotate({
    [ConvexId]: tableName,
    [ConvexIdScope]: scope ?? "",
  }) as unknown as Schema.Codec<GenericId<TableName, Scope>>;

export const scope = (ast: SchemaAST.AST): string =>
  SchemaAST.resolveAt<string>(ConvexIdScope)(ast) ?? "";

/** Rebind only IDs owned by `From`; IDs belonging to other scopes survive. */
export type Rebase<A, From extends string, To extends string> = A extends {
  readonly "~@confect/core/ScopedId": {
    readonly table: infer Table extends string;
    readonly scope: infer Scope extends string;
  };
}
  ? GenericId<Table, IdScope.Rebase<Scope, From, To>>
  : A extends ConvexGenericId<infer Table>
    ? From extends ""
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
  const From extends string,
  const To extends string,
>(
  schema: Schema_,
  from: From,
  to: To,
): Schema.Codec<
  Rebase<Schema_["Type"], From, To>,
  Rebase<Schema_["Encoded"], From, To>
> => {
  const cache = new WeakMap<SchemaAST.AST, SchemaAST.AST>();
  const visit = (ast: SchemaAST.AST): SchemaAST.AST => {
    const cached = cache.get(ast);
    if (cached) return cached;
    let next = ast;
    switch (ast._tag) {
      case "Objects":
        next = new SchemaAST.Objects(
          ast.propertySignatures.map(
            (p) => new SchemaAST.PropertySignature(p.name, visit(p.type)),
          ),
          ast.indexSignatures.map(
            (i) =>
              new SchemaAST.IndexSignature(visit(i.parameter), visit(i.type)),
          ),
          ast.annotations,
          ast.checks,
          undefined,
          ast.context,
          ast.encodingChecks,
        );
        break;
      case "Arrays":
        next = new SchemaAST.Arrays(
          ast.isMutable,
          ast.elements.map(visit),
          ast.rest.map(visit),
          ast.annotations,
          ast.checks,
          undefined,
          ast.context,
          ast.encodingChecks,
        );
        break;
      case "Union":
        next = new SchemaAST.Union(
          ast.types.map(visit),
          ast.mode,
          ast.annotations,
          ast.checks,
          undefined,
          ast.context,
          ast.encodingChecks,
        );
        break;
      case "Suspend":
        next = new SchemaAST.Suspend(
          () => visit(ast.thunk()),
          ast.annotations,
          ast.checks,
          undefined,
          ast.context,
        );
        break;
      case "Declaration":
        next = new SchemaAST.Declaration(
          ast.typeParameters.map(visit),
          ast.run,
          ast.annotations,
          ast.checks,
          undefined,
          ast.context,
          ast.encodingChecks,
          ast.encodingRun,
        );
        break;
    }
    const ownScope = scope(ast);
    if (
      Option.isSome(tableName(ast)) &&
      (ownScope === from || ownScope.startsWith(`${from}/instance:`))
    ) {
      next = Schema.make<Schema.Codec<unknown>>(next).annotate({
        [ConvexIdScope]: to + ownScope.slice(from.length),
      }).ast;
    }
    if (ast.encoding) {
      const descriptors: PropertyDescriptorMap =
        Object.getOwnPropertyDescriptors(next);
      descriptors.encoding = {
        value: ast.encoding.map(
          (link) => new SchemaAST.Link(visit(link.to), link.transformation),
        ),
        enumerable: true,
        configurable: true,
        writable: true,
      };
      next = Object.create(
        Object.getPrototypeOf(next),
        descriptors,
      ) as SchemaAST.AST;
    }
    cache.set(ast, next);
    return next;
  };
  return Schema.make(visit(schema.ast));
};

export const tableName = <TableName extends string>(
  ast: SchemaAST.AST,
): Option.Option<TableName> =>
  Option.fromNullishOr(SchemaAST.resolveAt<TableName>(ConvexId)(ast));
