import type { IdField, SystemFields as NonIdSystemFields } from "convex/server";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import type * as Struct from "effect/Struct";
import * as GenericId from "./GenericId";

/**
 * Produces a schema for Convex system fields. In Confect, system fields include `_id`.
 */
export const SystemFields = <TableName extends string>(tableName: TableName) =>
  Schema.Struct({
    _id: GenericId.GenericId(tableName),
    _creationTime: Schema.Number,
  });

/**
 * The field map added to a table schema, derived from {@link SystemFields} so it
 * stays in lockstep with the runtime schema.
 */
type SystemFieldsFor<TableName extends string> = ReturnType<
  typeof SystemFields<TableName>
>["fields"];

/**
 * Extend a table schema with Convex system fields.
 */
export const extendWithSystemFields = <
  TableName extends string,
  TableSchema extends Schema.Codec<any, any>,
>(
  tableName: TableName,
  schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> => {
  const system = SystemFields(tableName).fields;

  const extend = (s: Schema.Top): Schema.Top =>
    SchemaAST.isUnion(s.ast)
      ? Schema.Union((s as unknown as Schema.Union<ReadonlyArray<Schema.Top>>).members.map(extend))
      : Schema.fieldsAssign(system)(s as unknown as Schema.Struct<Schema.Struct.Fields>);

  return extend(schema) as unknown as ExtendWithSystemFields<TableName, TableSchema>;
};

/**
 * Applies the system fields to a single struct, mirroring `Schema.fieldsAssign`.
 * Any other (already-extended or opaque) schema falls back to a `Codec` carrying
 * the system-field document shape.
 */
type ApplySystemFields<TableName extends string, S> =
  S extends Schema.Struct<infer Fields extends Schema.Struct.Fields>
    ? Schema.Struct<Struct.Simplify<Struct.Assign<Fields, SystemFieldsFor<TableName>>>>
    : S extends Schema.Codec<infer Type, infer Encoded>
      ? Schema.Codec<WithSystemFields<TableName, Type>, WithSystemFields<TableName, Encoded>>
      : never;

/**
 * Extend a table schema with Convex system fields at the type level.
 *
 * This mirrors the runtime {@link extendWithSystemFields}: a `Struct` gains the
 * system fields directly (matching `Schema.fieldsAssign`), and a `Union` has
 * them distributed across its members (matching
 * `union.mapMembers(Tuple.map(Schema.fieldsAssign(...)))`). The `Struct`/`Union`
 * structure is preserved rather than collapsed to a bare `Codec`.
 */
export type ExtendWithSystemFields<TableName extends string, TableSchema extends Schema.Top> =
  TableSchema extends Schema.Union<infer Members extends ReadonlyArray<Schema.Top>>
    ? Schema.Union<
        Struct.Simplify<
          Readonly<{
            [K in keyof Members]: ExtendWithSystemFields<TableName, Members[K]>;
          }>
        >
      >
    : ApplySystemFields<TableName, TableSchema>;

/**
 * The decoded/encoded document shape: a table's fields plus Convex's system
 * fields. Deliberately a bare intersection (no `Expand`/`Simplify`) — flattening
 * it with a homomorphic mapped type collapses to `{ [x: string]: any }` when
 * `Document` is still an unresolved generic, which breaks structural
 * comparability in the database reader/writer plumbing.
 */
export type WithSystemFields<TableName extends string, Document> = Document extends unknown
  ? IdField<TableName> & NonIdSystemFields & Document
  : never;
