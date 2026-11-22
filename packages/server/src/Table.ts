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
  make,
  type Table,
  type Any,
  type AnyWithProps,
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
 * In a component, pass `systemTablesForScope(componentScope)._storage` or
 * `._scheduled_functions` to the database reader. Applications can use the
 * exported `_storage` and `_scheduled_functions` handles directly.
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
export const { _scheduled_functions, _storage } = systemTables;

/**
 * @internal
 */
export type SystemTables<Scope_ extends IdScope.IdScope = IdScope.App> =
  ReturnType<typeof systemTablesForScope<Scope_>>[keyof typeof systemTables];
