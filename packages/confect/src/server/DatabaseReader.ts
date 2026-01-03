import type { GenericDatabaseReader } from "convex/server";
import { Array, Context, Layer } from "effect";
import type { BaseDatabaseReader } from "../api/Types";
import * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as QueryInitializer from "./QueryInitializer";
import * as Table from "./Table";

export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) => {
  type Tables = DatabaseSchema.Tables<DatabaseSchema_>;
  type IncludedTables = DatabaseSchema.IncludeSystemTables<Tables>;
  const extendedTables = DatabaseSchema.extendWithSystemTables(
    databaseSchema.tables as Table.TablesRecord<Tables>,
  );

  return {
    table: <const TableName extends Table.Name<IncludedTables>>(
      tableName: TableName,
    ) => {
      const table = Object.values(extendedTables).find(
        (def) => def.name === tableName,
      ) as Table.WithName<IncludedTables, TableName>;

      const baseDatabaseReader: BaseDatabaseReader<any> = Array.some(
        Object.values(Table.systemTables),
        (systemTableDef) => systemTableDef.name === tableName,
      )
        ? ({
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          } as BaseDatabaseReader<
            DataModel.ToConvex<DataModel.FromTables<Table.SystemTables>>
          >)
        : ({
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          } as BaseDatabaseReader<
            DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
          >);

      return QueryInitializer.make<IncludedTables, TableName>(
        tableName,
        baseDatabaseReader,
        table,
      );
    },
  };
};

export const DatabaseReader = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<DatabaseSchema_>>>(
    "@rjdellecese/confect/server/DatabaseReader",
  );

export type DatabaseReader<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = ReturnType<typeof DatabaseReader<DatabaseSchema_>>["Identifier"];

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(
    DatabaseReader<DatabaseSchema_>(),
    make(databaseSchema, convexDatabaseReader),
  );
