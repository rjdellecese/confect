import * as Record from "effect/Record";
import { compileTableSchema } from "@confect/core/SchemaToValidator";
import * as Table_ from "@confect/core/Table";
import * as Schema from "effect/Schema";
import { defineTable, type TableDefinition } from "convex/server";

export {
  TypeId,
  isTable,
  isUnnamedTable,
  /**
   * Creates a lazy table definition from a callback returning the user-field
   * codec. Default-export the definition from a table file. Application specs
   * can import the same constructor from `@confect/core/Table` without
   * depending on the server package.
   *
   * @category Constructors
   */
  make,
  /**
   * Bound table handle used by database readers and writers. Import an
   * application handle from `_generated/tables/<name>` or a read-only system
   * handle, {@link _storage} or {@link _scheduled_functions}, from this
   * module.
   *
   * @category Models
   */
  type Table,
  type Any,
  type AnyWithProps,
  /**
   * Immutable table definition before code generation binds its name. The
   * `index`, `searchIndex`, and `vectorIndex` methods each return a new
   * definition without changing the original.
   *
   * @category Models
   */
  type UnnamedTable,
  type UnnamedAny,
  type UnnamedAnyWithProps,
  type Name,
  type TableSchema,
  type TableValidator,
  type Indexes,
  type SearchIndexes,
  type VectorIndexes,
  type Doc,
  type Fields,
  type WithName,
  type TablesRecord,
} from "@confect/core/Table";

// -----------------------------------------------------------------------------
// tableDefinition
// -----------------------------------------------------------------------------
//
// The deploy-time Convex `TableDefinition` is the part of a table that
// belongs on the server: it value-imports `defineTable` from `convex/server`.
// Specs and generated refs reach `Fields`/`Doc` through `@confect/core`,
// so this helper is only called from `_generated/convexSchema.ts`.

const tableDefinitionCache = new WeakMap<
  Table_.AnyWithProps,
  TableDefinition<any, any, any, any>
>();

/**
 * @internal
 */
export const tableDefinition = <Table extends Table_.AnyWithProps>(
  table: Table,
): TableDefinition<
  Table_.TableValidator<Table>,
  Table_.Indexes<Table>,
  Table_.SearchIndexes<Table>,
  Table_.VectorIndexes<Table>
> => {
  const cached = tableDefinitionCache.get(table);
  if (cached !== undefined) {
    return cached as TableDefinition<
      Table_.TableValidator<Table>,
      Table_.Indexes<Table>,
      Table_.SearchIndexes<Table>,
      Table_.VectorIndexes<Table>
    >;
  }

  let definition: TableDefinition<any, any, any, any> = table.Fields.pipe(
    compileTableSchema,
    defineTable,
  );
  for (const [name, indexFields] of Record.toEntries(
    table.indexes as Record<string, any>,
  )) {
    definition = definition.index(name, indexFields);
  }
  for (const [name, config] of Record.toEntries(
    table.searchIndexes as Record<string, any>,
  )) {
    definition = definition.searchIndex(name, config);
  }
  for (const [name, config] of Record.toEntries(
    table.vectorIndexes as Record<string, any>,
  )) {
    definition = definition.vectorIndex(name, config);
  }

  tableDefinitionCache.set(table, definition);
  return definition as TableDefinition<
    Table_.TableValidator<Table>,
    Table_.Indexes<Table>,
    Table_.SearchIndexes<Table>,
    Table_.VectorIndexes<Table>
  >;
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

/**
 * Read-only system table for scheduled calls, including the function name,
 * arguments, scheduled time, and execution state. Pass this handle to
 * `reader.table` to query or look up a scheduled call. Use the scheduler to
 * schedule or cancel calls.
 *
 * @category System tables
 */
export const _scheduled_functions = Table_.make(() =>
  Schema.Struct({
    name: Schema.String,
    args: Schema.Array(Schema.Any),
    scheduledTime: Schema.Finite,
    completedTime: Schema.optionalKey(Schema.Finite),
    state: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("pending") }),
      Schema.Struct({ kind: Schema.Literal("inProgress") }),
      Schema.Struct({ kind: Schema.Literal("success") }),
      Schema.Struct({
        kind: Schema.Literal("failed"),
        error: Schema.String,
      }),
      Schema.Struct({ kind: Schema.Literal("canceled") }),
    ]),
  }),
)("_scheduled_functions");

/**
 * Read-only system table for stored file metadata. Pass this handle to
 * `reader.table` to look up a storage ID's SHA-256 hash, size in bytes, and
 * optional content type. Use a storage service to access the file contents.
 *
 * @category System tables
 */
export const _storage = Table_.make(() =>
  Schema.Struct({
    sha256: Schema.String,
    size: Schema.Finite,
    contentType: Schema.optionalKey(Schema.String),
  }),
)("_storage");

/**
 * @internal
 */
export const systemTables = {
  _scheduled_functions,
  _storage,
} as const;

/**
 * @internal
 */
export type SystemTables = typeof _scheduled_functions | typeof _storage;
