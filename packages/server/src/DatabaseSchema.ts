import type { Expand, GenericSchema } from "convex/server";
import {
  defineSchema as defineConvexSchema,
  type SchemaDefinition,
} from "convex/server";
import { Array, pipe, Predicate, Record } from "effect";
import * as Table from "./Table";

export const TypeId = "@confect/server/DatabaseSchema";
export type TypeId = typeof TypeId;

export const isSchema = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * A schema definition tracks the schema and its Convex schema definition.
 */
export interface DatabaseSchema<Tables_ extends Table.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly tables: Table.TablesRecord<Tables_>;
  readonly convexSchemaDefinition: SchemaDefinition<
    ConvexDatabaseSchemaFromTables<Tables_>,
    true
  >;

  /**
   * Add a table definition to the schema.
   */
  addTable<TableDef extends Table.AnyWithProps>(
    table: TableDef,
  ): DatabaseSchema<Tables_ | TableDef>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps {
  readonly [TypeId]: TypeId;
  readonly tables: Record<string, Table.AnyWithProps>;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
  addTable<TableDef extends Table.AnyWithProps>(table: TableDef): AnyWithProps;
}

export type Tables<DatabaseSchema_ extends AnyWithProps> =
  DatabaseSchema_ extends DatabaseSchema<infer Tables_> ? Tables_ : never;

export type TableNames<DatabaseSchema_ extends AnyWithProps> = Table.Name<
  Tables<DatabaseSchema_>
> &
  string;

export type TableWithName<
  DatabaseSchema_ extends AnyWithProps,
  TableName extends TableNames<DatabaseSchema_>,
> = Extract<Tables<DatabaseSchema_>, { readonly name: TableName }>;

const Proto = {
  [TypeId]: TypeId,

  addTable<TableDef extends Table.AnyWithProps>(
    this: DatabaseSchema<Table.AnyWithProps>,
    table: TableDef,
  ) {
    const tablesArray = Object.values(this.tables) as Table.AnyWithProps[];
    const newTablesArray = [...tablesArray, table];

    return makeProto({
      tables: Record.set(this.tables, table.name, table),
      convexSchemaDefinition: pipe(
        newTablesArray,
        Array.map(
          ({ name, tableDefinition }) => [name, tableDefinition] as const,
        ),
        Record.fromEntries,
        defineConvexSchema,
      ),
    });
  },
};

const makeProto = <Tables_ extends Table.AnyWithProps>({
  tables,
  convexSchemaDefinition,
}: {
  tables: Record.ReadonlyRecord<string, Tables_>;
  convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}): DatabaseSchema<Tables_> =>
  Object.assign(Object.create(Proto), {
    tables,
    convexSchemaDefinition,
  });

/**
 * Create an empty schema definition. Add tables incrementally via `addTable`.
 */
export const make = (): DatabaseSchema<never> =>
  makeProto({
    tables: Record.empty(),
    convexSchemaDefinition: defineConvexSchema({}),
  });

export type ConvexDatabaseSchemaFromTables<Tables_ extends Table.AnyWithProps> =
  Expand<{
    [TableName in Table.Name<Tables_> & string]: Table.WithName<
      Tables_,
      TableName
    >["tableDefinition"];
  }>;

// System tables

export const systemSchema = make()
  .addTable(Table.scheduledFunctionsTable)
  .addTable(Table.storageTable);

export const extendWithSystemTables = <Tables_ extends Table.AnyWithProps>(
  tables: Table.TablesRecord<Tables_>,
): ExtendWithSystemTables<Tables_> =>
  ({
    ...tables,
    ...Table.systemTables,
  }) as ExtendWithSystemTables<Tables_>;

export type ExtendWithSystemTables<Tables_ extends Table.AnyWithProps> =
  Table.TablesRecord<Tables_ | Table.SystemTables>;

export type IncludeSystemTables<Tables_ extends Table.AnyWithProps> =
  | Tables_
  | Table.SystemTables extends infer T
  ? T extends Table.AnyWithProps
    ? T
    : never
  : never;
