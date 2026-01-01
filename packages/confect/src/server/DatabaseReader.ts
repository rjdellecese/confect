import type { GenericDatabaseReader } from "convex/server";
import { Array, Context, Layer } from "effect";
import type { BaseDatabaseReader } from "../internal/typeUtils";
import type * as DataModel from "./DataModel";
import * as QueryInitializer from "./QueryInitializer";
import * as DatabaseSchema from "./DatabaseSchema";
import * as Table from "./Table";

export const make = <Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps>(
  schema: Schema,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
  >,
) => {
  type Tables = DatabaseSchema.DatabaseSchema.Tables<Schema>;
  type IncludedTables = DatabaseSchema.IncludeSystemTables<Tables>;
  const extendedTables = DatabaseSchema.extendWithSystemTables(
    schema.tables as Table.Table.TablesRecord<Tables>,
  );

  return {
    table: <const TableName extends Table.Table.Name<IncludedTables>>(
      tableName: TableName,
    ) => {
      const table = Object.values(extendedTables).find(
        (def) => def.name === tableName,
      ) as Table.Table.WithName<IncludedTables, TableName>;

      const baseDatabaseReader: BaseDatabaseReader<any> = Array.some(
        Object.values(Table.systemTables),
        (systemTableDef) => systemTableDef.name === tableName,
      )
        ? ({
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          } as BaseDatabaseReader<
            DataModel.DataModel.ToConvex<
              DataModel.DataModel.FromTables<Table.SystemTables>
            >
          >)
        : ({
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          } as BaseDatabaseReader<
            DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
          >);

      return QueryInitializer.make<IncludedTables, TableName>(
        tableName,
        baseDatabaseReader,
        table,
      );
    },
  };
};

export const DatabaseReader = <Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps>() =>
  Context.GenericTag<ReturnType<typeof make<Schema>>>(
    "@rjdellecese/confect/server/DatabaseReader",
  );

export type DatabaseReader<Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps> =
  ReturnType<typeof DatabaseReader<Schema>>["Identifier"];

export const layer = <Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps>(
  schema: Schema,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
  >,
) =>
  Layer.succeed(DatabaseReader<Schema>(), make(schema, convexDatabaseReader));
