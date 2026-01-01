import type { GenericSchema } from "convex/server";
import {
  defineSchema as defineConvexSchema,
  type SchemaDefinition,
} from "convex/server";
import { Array, pipe, Predicate, Record } from "effect";
import * as Table from "./Table";

export const TypeId = "@rjdellecese/confect/server/Schema";
export type TypeId = typeof TypeId;

export const isSchema = (u: unknown): u is DatabaseSchema.Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * A schema definition tracks the schema and its Convex schema definition.
 */
export interface DatabaseSchema<
  Tables extends Table.Table.AnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly tables: Table.Table.TablesRecord<Tables>;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;

  /**
   * Add a table definition to the schema.
   */
  addTable<TableDef extends Table.Table.AnyWithProps>(
    table: TableDef,
  ): DatabaseSchema<Tables | TableDef>;
}

export declare namespace DatabaseSchema {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps {
    readonly [TypeId]: TypeId;
    readonly tables: Record<string, Table.Table.AnyWithProps>;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
    addTable<TableDef extends Table.Table.AnyWithProps>(
      table: TableDef,
    ): AnyWithProps;
  }

  export type Tables<S extends AnyWithProps> =
    S extends DatabaseSchema<infer Tables_> ? Tables_ : never;

  export type TableNames<S extends AnyWithProps> = Table.Table.Name<Tables<S>> &
    string;

  export type TableWithName<
    S extends AnyWithProps,
    TableName extends TableNames<S>,
  > = Extract<Tables<S>, { readonly name: TableName }>;
}

const Proto = {
  [TypeId]: TypeId,

  addTable<TableDef extends Table.Table.AnyWithProps>(
    this: DatabaseSchema<Table.Table.AnyWithProps>,
    table: TableDef,
  ) {
    const tablesArray = Object.values(
      this.tables,
    ) as Table.Table.AnyWithProps[];
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

const makeProto = <Tables extends Table.Table.AnyWithProps>({
  tables,
  convexSchemaDefinition,
}: {
  tables: Record.ReadonlyRecord<string, Tables>;
  convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}): DatabaseSchema<Tables> =>
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

// System tables

export const systemSchema = make()
  .addTable(Table.scheduledFunctionsTable)
  .addTable(Table.storageTable);

export const extendWithSystemTables = <Tables extends Table.Table.AnyWithProps>(
  tables: Table.Table.TablesRecord<Tables>,
): ExtendWithSystemTables<Tables> =>
  ({
    ...tables,
    ...Table.systemTables,
  }) as ExtendWithSystemTables<Tables>;

export type ExtendWithSystemTables<Tables extends Table.Table.AnyWithProps> =
  Table.Table.TablesRecord<Tables | Table.SystemTables>;

export type IncludeSystemTables<Tables extends Table.Table.AnyWithProps> =
  | Tables
  | Table.SystemTables;
