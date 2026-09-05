import { compileTableSchema } from "@confect/core/SchemaToValidator";
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
// Specs and generated refs reach `Fields` / `Doc` through `@confect/core`,
// so this helper is only called from `_generated/convexSchema.ts`.

const tableDefinitionCache = new WeakMap<
  Table_.AnyWithProps,
  TableDefinition<any, any, any, any>
>();

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

  let definition: TableDefinition<any, any, any, any> = defineTable(
    compileTableSchema(table.Fields, table.scope),
  );
  for (const [name, indexFields] of Object.entries(
    table.indexes as Record<string, any>,
  )) {
    definition = definition.index(name, indexFields);
  }
  for (const [name, config] of Object.entries(
    table.searchIndexes as Record<string, any>,
  )) {
    definition = definition.searchIndex(name, config);
  }
  for (const [name, config] of Object.entries(
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

export const scheduledFunctionsTable = Table_.make(() =>
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

export const storageTable = Table_.make(() =>
  Schema.Struct({
    sha256: Schema.String,
    size: Schema.Finite,
    contentType: Schema.optionalKey(Schema.String),
  }),
)("_storage");

export const systemTables = {
  _scheduled_functions: scheduledFunctionsTable,
  _storage: storageTable,
} as const;

export const systemTablesForScope = <const Scope_ extends string>(
  scope: Scope_,
) => ({
  _scheduled_functions: Table_.make(() => scheduledFunctionsTable.Fields)(
    "_scheduled_functions",
    scope,
  ),
  _storage: Table_.make(() => storageTable.Fields)("_storage", scope),
});

export type SystemTables<Scope_ extends string = ""> = ReturnType<
  typeof systemTablesForScope<Scope_>
>[keyof typeof systemTables];
