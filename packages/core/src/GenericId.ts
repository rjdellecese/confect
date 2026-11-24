/**
 * Document IDs for hand-authored component contracts. For your own project's
 * tables, use `Id` from `confect/_generated/id`, which already knows their
 * names and scope.
 */

import type { GenericId as ConvexGenericId } from "convex/values";
import * as Array from "effect/Array";
import { memoize } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as String from "effect/String";
import * as IdScope from "./IdScope";

const ConvexId = "~@confect/core/ConvexId";
const ConvexIdScope = "~@confect/core/ConvexIdScope";

/**
 * A document ID for one table in one database scope. In the application scope
 * it is the native Convex ID type. Component IDs stay distinct from application
 * IDs even for tables with the same name. The stored string is unchanged.
 *
 * @category Models
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

/**
 * Creates an ID schema for a table in a hand-authored component contract. Pass
 * the component's definition scope so that binding the contract can distinguish
 * IDs from different installations. Omitting the scope creates an application
 * ID schema.
 *
 * **Gotchas**
 *
 * Decoding accepts any string. It does not check the ID's format, table
 * membership, or existence.
 *
 * @category Schemas
 */
export const GenericId = <
  TableName extends string,
  const Scope extends IdScope.IdScope = IdScope.App,
>(
  tableName: TableName,
  ...scope: IdScope.Args<Scope>
): Schema.toType<Schema.refine<GenericId<TableName, Scope>, Schema.String>> =>
  Schema.String.annotate({
    [ConvexId]: tableName,
    [ConvexIdScope]: scope[0] ?? IdScope.app,
  }).pipe(
    Schema.refine((_value): _value is GenericId<TableName, Scope> => true),
    Schema.toType,
  );

/**
 * Reads the scope used to select a Convex validator for an ID codec.
 *
 * @internal
 */
export const scope = (ast: SchemaAST.AST): IdScope.IdScope =>
  (ast.annotations?.[ConvexIdScope] as IdScope.IdScope | undefined) ??
  SchemaAST.resolveAt<IdScope.IdScope>(ConvexIdScope)(ast) ??
  IdScope.app;

type WithOriginalIdBrands<Id, Original> =
  Exclude<
    keyof Original,
    keyof ConvexGenericId<string> | "~@confect/core/ScopedId"
  > extends infer Keys extends keyof Original
    ? [Keys] extends [never]
      ? Id
      : Id & Pick<Original, Keys>
    : never;

/**
 * The ID types of a bound component's values. Use the types inferred by
 * `Component.bind` or `Component.schema` instead of rebasing them by hand.
 *
 * @internal
 */
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
  ? WithOriginalIdBrands<GenericId<Table, IdScope.Rebase<Scope, From, To>>, A>
  : A extends ConvexGenericId<infer Table>
    ? From extends IdScope.App
      ? WithOriginalIdBrands<GenericId<Table, To>, A>
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
      : A extends Map<infer Key, infer Value>
        ? Map<Rebase<Key, From, To>, Rebase<Value, From, To>>
        : A extends ReadonlyMap<infer Key, infer Value>
          ? ReadonlyMap<Rebase<Key, From, To>, Rebase<Value, From, To>>
          : A extends Set<infer Value>
            ? Set<Rebase<Value, From, To>>
            : A extends ReadonlySet<infer Value>
              ? ReadonlySet<Rebase<Value, From, To>>
              : A extends ReadonlyArray<unknown>
                ? { [K in keyof A]: Rebase<A[K], From, To> }
                : A extends object
                  ? {
                      [
                        K in keyof A as K extends ConvexGenericId<string>
                          ? Rebase<K, From, To>
                          : K
                      ]: Rebase<A[K], From, To>;
                    }
                  : A;

/**
 * Rebinds scope annotations on both sides of a codec while retaining its
 * transformations, checks, optional fields, and declaration parsers. Use
 * `Component.schema` to bind a component's exported codec.
 *
 * @internal
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
            union.options,
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
      (ownScope === from || String.startsWith(`${from}/instance:`)(ownScope))
        ? (Object.create(Object.getPrototypeOf(next), {
            ...Object.getOwnPropertyDescriptors(next),
            annotations: {
              value: {
                ...next.annotations,
                [ConvexIdScope]: to + String.slice(from.length)(ownScope),
              },
              enumerable: true,
              configurable: true,
              writable: true,
            },
          }) as SchemaAST.AST)
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
