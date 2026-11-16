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
   * Re-export of the lazy table-definition constructor from
   * `@confect/core/Table`. Pass a callback producing the user-field codec and
   * default-export the returned definition from a table file. Prefer the core
   * import in application specs so they do not depend on the server package.
   *
   * @category Constructors
   */
  make,
  /**
   * The bound handle accepted by database readers and writers. Import an
   * application table's handle from `_generated/tables/<name>`; import the
   * read-only system handles {@link _storage} and {@link _scheduled_functions}
   * from this module.
   *
   * @category Models
   */
  type Table,
  type Any,
  type AnyWithProps,
  /**
   * Immutable table builder returned by make, before generated name binding.
   * Its index, searchIndex, and vectorIndex methods return new definitions; the
   * canonical contract is in `@confect/core/Table`.
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
 * Read-only handle for scheduled function records, including the function name,
 * arguments, scheduled time, and execution state. Pass it to `reader.table` to
 * look up a scheduled call by ID or query its records. Schedule or cancel calls
 * through the scheduler, not the database writer.
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
 * Read-only handle for stored file metadata. Pass it to `reader.table` and look
 * up a storage ID to read the file's SHA-256 hash, size in bytes, and optional
 * content type. Use a storage service to access the file itself.
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
