import type { GenericSchema } from "convex/server";
import {
  defineSchema as defineConvexSchema,
  type SchemaDefinition,
} from "convex/server";
import { Array, pipe, Predicate, Record } from "effect";
import * as ConfectTable from "./ConfectTable";

export const TypeId = "@rjdellecese/confect/ConfectSchema";
export type TypeId = typeof TypeId;

export const isConfectSchema = (u: unknown): u is ConfectSchema.Any =>
  Predicate.hasProperty(u, TypeId);

/**
 * A Confect schema definition tracks the Confect schema and its Convex schema definition.
 */
export interface ConfectSchema<
  Tables extends ConfectTable.ConfectTable.AnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly tables: ConfectTable.ConfectTable.TablesRecord<Tables>;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;

  /**
   * Add a table definition to the schema.
   */
  addTable<Table extends ConfectTable.ConfectTable.AnyWithProps>(
    table: Table,
  ): ConfectSchema<Tables | Table>;
}

export declare namespace ConfectSchema {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps {
    readonly [TypeId]: TypeId;
    readonly tables: Record<string, ConfectTable.ConfectTable.AnyWithProps>;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
    addTable<Table extends ConfectTable.ConfectTable.AnyWithProps>(
      table: Table,
    ): AnyWithProps;
  }

  export type Tables<ConfectSchema_ extends AnyWithProps> =
    ConfectSchema_ extends ConfectSchema<infer Tables_> ? Tables_ : never;

  export type TableNames<ConfectSchema_ extends AnyWithProps> =
    ConfectTable.ConfectTable.Name<Tables<ConfectSchema_>> & string;

  export type TableWithName<
    ConfectSchema_ extends AnyWithProps,
    TableName extends TableNames<ConfectSchema_>,
  > = Extract<Tables<ConfectSchema_>, { readonly name: TableName }>;
}

const Proto = {
  [TypeId]: TypeId,

  addTable<Table extends ConfectTable.ConfectTable.AnyWithProps>(
    this: ConfectSchema<ConfectTable.ConfectTable.AnyWithProps>,
    table: Table,
  ) {
    const tablesArray = Object.values(
      this.tables,
    ) as ConfectTable.ConfectTable.AnyWithProps[];
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

const makeProto = <Tables extends ConfectTable.ConfectTable.AnyWithProps>({
  tables,
  convexSchemaDefinition,
}: {
  tables: Record.ReadonlyRecord<string, Tables>;
  convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}): ConfectSchema<Tables> =>
  Object.assign(Object.create(Proto), {
    tables,
    convexSchemaDefinition,
  });

/**
 * Create an empty Confect schema definition. Add tables incrementally via `addTable`.
 */
export const make = (): ConfectSchema<never> =>
  makeProto({
    tables: Record.empty(),
    convexSchemaDefinition: defineConvexSchema({}),
  });

// System tables

export const confectSystemSchema = make()
  .addTable(ConfectTable.scheduledFunctionsTable)
  .addTable(ConfectTable.storageTable);

export const extendWithConfectSystemTables = <
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
>(
  tables: ConfectTable.ConfectTable.TablesRecord<Tables>,
): ExtendWithConfectSystemTables<Tables> =>
  ({
    ...tables,
    ...ConfectTable.confectSystemTables,
  }) as ExtendWithConfectSystemTables<Tables>;

export type ExtendWithConfectSystemTables<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> = ConfectTable.ConfectTable.TablesRecord<
  Tables | ConfectTable.ConfectSystemTables
>;

export type IncludeConfectSystemTables<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> = Tables | ConfectTable.ConfectSystemTables;
