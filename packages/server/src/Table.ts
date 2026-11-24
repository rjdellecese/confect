import * as Record from "effect/Record";
import * as IdScope from "@confect/core/IdScope";
import {
  compileTableSchema,
  type EmittedTableValidator,
} from "@confect/core/SchemaToValidator";
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
   * Bound table handle used by database readers and writers. Import a handle
   * from `_generated/tables/<name>`. For system reads, use an application
   * handle ({@link _storage} or {@link _scheduled_functions}) or select a
   * component-scoped handle with {@link systemTablesForScope}.
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
  type Scope,
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

type CompiledTable<Table extends Table_.AnyWithProps> =
  Table extends Table_.Table<
    string,
    infer Fields,
    any,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes,
    infer Scope
  >
    ? TableDefinition<
        EmittedTableValidator<Fields, Scope>,
        Indexes,
        SearchIndexes,
        VectorIndexes
      >
    : never;

/**
 * Constructs a native table definition for the generated deployment schema. For
 * deployment or test setup, default-import `confect/_generated/convexSchema`
 * rather than calling the converter directly.
 *
 * @internal
 */
export const tableDefinition = <Table extends Table_.AnyWithProps>(
  table: Table,
): CompiledTable<Table> => {
  const cached = tableDefinitionCache.get(table);
  if (cached !== undefined) {
    return cached as CompiledTable<Table>;
  }

  let definition: TableDefinition<any, any, any, any> = defineTable(
    compileTableSchema(table.Fields, table.scope),
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
  return definition as CompiledTable<Table>;
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

const scheduledFunctions = Table_.make(() =>
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
);

const storage = Table_.make(() =>
  Schema.Struct({
    sha256: Schema.String,
    size: Schema.Finite,
    contentType: Schema.optionalKey(Schema.String),
  }),
);

/**
 * Returns read-only handles for the storage and scheduled-function system
 * tables in the supplied ID scope. In a component, pass its generated `scope`
 * from `_generated/id` and use the returned `_storage` or
 * `_scheduled_functions` with `reader.table`.
 *
 * @category System tables
 *
 * @see {@link _storage} and {@link _scheduled_functions} for the application handles.
 */
export const systemTablesForScope = <const Scope_ extends IdScope.IdScope>(
  scope: Scope_,
) =>
  ({
    _scheduled_functions: scheduledFunctions("_scheduled_functions", scope),
    _storage: storage("_storage", scope),
  }) as const;

/**
 * @internal
 */
export const systemTables = systemTablesForScope(IdScope.app);
export const {
  /**
   * Read-only application system table for scheduled calls, including the
   * function name, arguments, scheduled time, and execution state. Pass this
   * handle to `reader.table` to query or look up a scheduled call. Use the
   * scheduler to schedule or cancel calls.
   *
   * @category System tables
   */
  _scheduled_functions,
  /**
   * Read-only application system table for stored file metadata. Pass this
   * handle to `reader.table` to look up a storage ID's SHA-256 hash, size in
   * bytes, and optional content type. Use a storage service to access the file
   * contents.
   *
   * @category System tables
   */
  _storage,
} = systemTables;

/**
 * @internal
 */
export type SystemTables<Scope_ extends IdScope.IdScope = IdScope.App> =
  ReturnType<typeof systemTablesForScope<Scope_>>[keyof typeof systemTables];
