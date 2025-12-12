import type { GenericSchema } from "convex/server";
import {
  defineSchema as defineConvexSchema,
  type SchemaDefinition,
} from "convex/server";
import { Array, pipe, Predicate, Record } from "effect";
import type { DataModelFromConfectDataModel } from "./ConfectDataModel";
import * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";

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
  readonly tables: {
    [TableName in Tables["name"]]: Extract<
      Tables,
      { readonly name: TableName }
    >;
  };
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

  export type Tables<S extends AnyWithProps> =
    S extends ConfectSchema<infer T> ? T : never;

  export type TableNames<S extends AnyWithProps> =
    ConfectTable.ConfectTable.Name<Tables<S>> & string;

  export type TableWithName<
    S extends AnyWithProps,
    TableName extends TableNames<S>,
  > = Extract<Tables<S>, { readonly name: TableName }>;
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

// -----------------------------------------------------------------------------
// Type utilities
// -----------------------------------------------------------------------------

/**
 * @ignore
 */
export type ConfectDataModelFromConfectSchema<
  S extends ConfectSchema.AnyWithProps,
> =
  S extends ConfectSchema<infer Tables>
    ? ConfectDataModelFromConfectTables<Tables>
    : never;

export type DataModelFromConfectSchema<S extends ConfectSchema.AnyWithProps> =
  DataModelFromConfectDataModel<ConfectDataModelFromConfectSchema<S>>;

export type DataModelFromConfectTables<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> = DataModelFromConfectDataModel<ConfectDataModelFromConfectTables<Tables>>;

// TODO: Move to ConfectDataModel.d.ts module
/**
 * Produce a Confect data model from Confect tables.
 */
export type ConfectDataModelFromConfectTables<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> = {
  [Table in Tables as ConfectTable.ConfectTable.Name<Table>]: ConfectTableInfo.ConfectTableInfo<Table>;
};

export const confectSystemSchema = make()
  .addTable(ConfectTable.scheduledFunctionsTable)
  .addTable(ConfectTable.storageTable);

type ConfectSystemSchema = typeof confectSystemSchema;

export type ConfectSystemDataModel =
  ConfectDataModelFromConfectSchema<ConfectSystemSchema>;

export const extendWithConfectSystemTables = <
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
>(tables: {
  [K in Tables["name"]]: Extract<Tables, { readonly name: K }>;
}): ExtendWithConfectSystemTables<Tables> =>
  ({
    ...tables,
    ...ConfectTable.confectSystemTables,
  }) as any;

export type ExtendWithConfectSystemTables<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> = Tables | ConfectTable.ConfectSystemTables;
