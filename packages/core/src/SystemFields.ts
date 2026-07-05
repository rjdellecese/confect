import type { IdField, SystemFields as NonIdSystemFields } from "convex/server";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaTransformation from "effect/SchemaTransformation";
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
 * The system field names, derived from {@link SystemFields} so they stay in
 * lockstep with the schema.
 */
const systemFieldNames: ReadonlyArray<string> = Object.keys(
  SystemFields("").fields,
);

const splitSystemFields = (input: Record<PropertyKey, unknown>) => {
  const system: Record<string, unknown> = {};
  const rest: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key === "string" && systemFieldNames.includes(key)) {
      system[key] = input[key];
    } else {
      rest[key] = input[key];
    }
  }
  return { system, rest };
};

/**
 * Wraps a transformation getter so the system fields bypass it: they are split
 * off the input before the user-defined getter runs and merged back into its
 * output. Transformations construct fresh objects, so without this the system
 * fields would be dropped at every transformation step.
 */
const wrapGetter = (
  getter: SchemaGetter.Getter<any, any, any>,
): SchemaGetter.Getter<any, any, any> =>
  new SchemaGetter.Getter((input, options) => {
    if (
      Option.isNone(input) ||
      typeof input.value !== "object" ||
      input.value === null
    ) {
      return getter.run(input, options);
    }
    const { system, rest } = splitSystemFields(
      input.value as Record<PropertyKey, unknown>,
    );
    return getter
      .run(Option.some(rest), options)
      .pipe(
        Effect.map(
          Option.map((output) =>
            typeof output === "object" && output !== null
              ? Object.assign({}, output, system)
              : output,
          ),
        ),
      );
  });

const wrapTransformation = (
  transformation: SchemaAST.Link["transformation"],
): SchemaTransformation.Transformation<any, any, any, any> => {
  if (!SchemaTransformation.isTransformation(transformation)) {
    throw new Error(
      "Cannot extend a table schema that uses decoding/encoding middleware with system fields",
    );
  }
  return new SchemaTransformation.Transformation(
    wrapGetter(transformation.decode),
    wrapGetter(transformation.encode),
  );
};

/**
 * Builds an AST walker that adds the given system-field property signatures to
 * every object node of a schema's AST — including each step of its encoding
 * chain — wrapping transformations so the fields survive them.
 */
const makeExtendAst = (
  systemPropertySignatures: ReadonlyArray<SchemaAST.PropertySignature>,
) => {
  const extendEncoding = (encoding: SchemaAST.Encoding): SchemaAST.Encoding =>
    Array.map(
      encoding,
      (link) =>
        new SchemaAST.Link(
          extendAst(link.to),
          wrapTransformation(link.transformation),
        ),
    );

  const extendAst = (ast: SchemaAST.AST): SchemaAST.AST => {
    if (SchemaAST.isUnion(ast)) {
      return new SchemaAST.Union(
        ast.types.map(extendAst),
        ast.mode,
        ast.annotations,
        ast.checks,
        ast.encoding === undefined ? undefined : extendEncoding(ast.encoding),
        ast.context,
        ast.encodingChecks,
      );
    }
    if (SchemaAST.isSuspend(ast)) {
      return new SchemaAST.Suspend(
        () => extendAst(ast.thunk()),
        ast.annotations,
        undefined,
        ast.encoding === undefined ? undefined : extendEncoding(ast.encoding),
        ast.context,
      );
    }
    if (SchemaAST.isObjects(ast)) {
      return new SchemaAST.Objects(
        [...ast.propertySignatures, ...systemPropertySignatures],
        ast.indexSignatures,
        ast.annotations,
        ast.checks,
        ast.encoding === undefined ? undefined : extendEncoding(ast.encoding),
        ast.context,
        ast.encodingChecks,
      );
    }
    throw new Error(
      ast._tag === "Declaration"
        ? "Cannot extend a `Declaration` schema (such as a `Schema.Class`) with system fields: its decoded values are constructed instances, which cannot gain extra fields. Use a plain `Schema.Struct`, or transform to one with `Schema.decodeTo`."
        : `Cannot extend a \`${ast._tag}\` schema node with system fields: a table schema must resolve to an object shape at every step of its encoding.`,
    );
  };

  return extendAst;
};

/**
 * Extend a table schema with Convex system fields.
 *
 * A plain `Struct` gains the fields via `Schema.fieldsAssign` and a `Union`
 * has them distributed across its members, preserving the schema's
 * `Struct`/`Union` structure. Any other object-shaped schema — one built with
 * `Schema.decodeTo`/`Schema.encodeKeys`, a branded struct, a suspended schema
 * — is extended at the AST level: every object node in its encoding chain
 * gains the system fields, and each transformation is wrapped so the fields
 * bypass the user-defined getters. Schemas that do not resolve to an object
 * shape at every step (such as `Schema.Class`, whose decoded values are class
 * instances) are rejected with a descriptive error.
 *
 * Note that struct-level checks on an extended schema observe the value with
 * the system fields attached, and encoding an extended schema emits the system
 * fields alongside the table fields.
 */
export const extendWithSystemFields = <
  TableName extends string,
  TableSchema extends Schema.Codec<any, any>,
>(
  tableName: TableName,
  schema: TableSchema,
): ExtendWithSystemFields<TableName, TableSchema> => {
  const system = SystemFields(tableName).fields;

  const extendAst = makeExtendAst(
    Object.entries(system).map(
      ([name, field]) => new SchemaAST.PropertySignature(name, field.ast),
    ),
  );

  const extend = (s: Schema.Top): Schema.Top => {
    if (
      s.ast.encoding === undefined &&
      SchemaAST.isUnion(s.ast) &&
      globalThis.Array.isArray(
        (s as Partial<Schema.Union<ReadonlyArray<Schema.Top>>>).members,
      )
    ) {
      return Schema.Union(
        (s as Schema.Union<ReadonlyArray<Schema.Top>>).members.map(extend),
      );
    }
    if (
      s.ast.encoding === undefined &&
      SchemaAST.isObjects(s.ast) &&
      typeof (s as Partial<Schema.Struct<Schema.Struct.Fields>>).mapFields ===
        "function"
    ) {
      return Schema.fieldsAssign(system)(
        s as Schema.Struct<Schema.Struct.Fields>,
      );
    }
    return Schema.make(extendAst(s.ast));
  };

  return extend(schema) as unknown as ExtendWithSystemFields<
    TableName,
    TableSchema
  >;
};

/**
 * Applies the system fields to a single struct, mirroring `Schema.fieldsAssign`.
 * Any other (already-extended or opaque) schema falls back to a `Codec` carrying
 * the system-field document shape.
 */
type ApplySystemFields<TableName extends string, S> =
  S extends Schema.Struct<infer Fields extends Schema.Struct.Fields>
    ? Schema.Struct<
        Struct.Simplify<Struct.Assign<Fields, SystemFieldsFor<TableName>>>
      >
    : S extends Schema.Codec<infer Type, infer Encoded>
      ? Schema.Codec<
          WithSystemFields<TableName, Type>,
          WithSystemFields<TableName, Encoded>
        >
      : never;

/**
 * Extend a table schema with Convex system fields at the type level.
 *
 * This mirrors the runtime {@link extendWithSystemFields}: a `Struct` gains the
 * system fields directly (matching `Schema.fieldsAssign`), and a `Union` has
 * them distributed across its members (matching
 * `union.mapMembers(Tuple.map(Schema.fieldsAssign(...)))`). The `Struct`/`Union`
 * structure is preserved rather than collapsed to a bare `Codec`; any other
 * schema falls back to a `Codec` carrying the system-field document shape,
 * matching the runtime's AST-level extension.
 */
export type ExtendWithSystemFields<
  TableName extends string,
  TableSchema extends Schema.Top,
> =
  TableSchema extends Schema.Union<
    infer Members extends ReadonlyArray<Schema.Top>
  >
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
export type WithSystemFields<
  TableName extends string,
  Document,
> = Document extends unknown
  ? IdField<TableName> & NonIdSystemFields & Document
  : never;
