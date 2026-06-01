import type { GenericDatabaseReader } from "convex/server";
import { Context, Layer } from "effect";
import type { BaseDatabaseReader } from "@confect/core/Types";
import type * as DatabaseSchema from "./DatabaseSchema";
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
  type IncludedTables = Tables | Table.SystemTables;

  return {
    table: <const TableName extends Table.Name<IncludedTables>>(
      tableName: TableName,
    ) => {
      const isSystem = Object.hasOwn(Table.systemTables, tableName);

      const baseDatabaseReader: BaseDatabaseReader<any> = isSystem
        ? {
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          }
        : {
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          };

      const table = (
        isSystem
          ? (Table.systemTables as Record<string, Table.AnyWithProps>)[
              tableName
            ]
          : databaseSchema.tables[tableName]
      ) as Table.WithName<IncludedTables, TableName>;

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
    "@confect/server/DatabaseReader",
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
