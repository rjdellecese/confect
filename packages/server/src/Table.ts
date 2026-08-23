import { compileTableSchema } from "@confect/core/SchemaToValidator";
import * as CoreTable from "@confect/core/Table";
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
  CoreTable.AnyWithProps,
  TableDefinition<any, any, any, any>
>();

export const tableDefinition = <Table_ extends CoreTable.AnyWithProps>(
  table: Table_,
): TableDefinition<
  CoreTable.TableValidator<Table_>,
  CoreTable.Indexes<Table_>,
  CoreTable.SearchIndexes<Table_>,
  CoreTable.VectorIndexes<Table_>
> => {
  const cached = tableDefinitionCache.get(table);
  if (cached !== undefined) {
    return cached as TableDefinition<
      CoreTable.TableValidator<Table_>,
      CoreTable.Indexes<Table_>,
      CoreTable.SearchIndexes<Table_>,
      CoreTable.VectorIndexes<Table_>
    >;
  }

  let definition: TableDefinition<any, any, any, any> = defineTable(
    compileTableSchema(table.Fields),
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
    CoreTable.TableValidator<Table_>,
    CoreTable.Indexes<Table_>,
    CoreTable.SearchIndexes<Table_>,
    CoreTable.VectorIndexes<Table_>
  >;
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

export const scheduledFunctionsTable = CoreTable.make(() =>
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

export const storageTable = CoreTable.make(() =>
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

export type SystemTables = typeof scheduledFunctionsTable | typeof storageTable;
