import type { GenericDatabaseReader } from "convex/server";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type { BaseDatabaseReader } from "@confect/core/Types";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as QueryInitializer from "./QueryInitializer";
import * as Table from "./Table";

type IncludedTables<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  | DatabaseSchema.Tables<DatabaseSchema_>
  | Table.SystemTables;

/**
 * The service shape backing the `DatabaseReader` tag. Named (rather than an
 * inferred anonymous object) so that declaration emit prints
 * `DatabaseReaderService<…>` by reference instead of expanding the entire data
 * model — both in `_generated/services.d.ts` and in every user helper's Effect
 * requirements channel.
 */
export interface DatabaseReaderService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> {
  readonly table: <
    const TableName extends Table.Name<IncludedTables<DatabaseSchema_>>,
  >(
    tableName: TableName,
  ) => QueryInitializer.QueryInitializer<
    DataModel.DataModel<IncludedTables<DatabaseSchema_>>,
    TableName,
    DataModel.TableInfoWithName<
      DataModel.DataModel<IncludedTables<DatabaseSchema_>>,
      TableName
    >,
    DataModel.TableInfoWithName_<
      DataModel.DataModel<IncludedTables<DatabaseSchema_>>,
      TableName
    >
  >;
}

export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
): DatabaseReaderService<DatabaseSchema_> => {
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

/**
 * The fully-applied tag type for a given schema. Codegen annotates its
 * `_generated/services.ts` export with this alias so declaration emit copies
 * `DatabaseReaderTag<typeof schemaDefinition>` verbatim — keeping
 * `typeof schemaDefinition` a reference instead of expanding the whole schema.
 */
export type DatabaseReaderTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = Context.Tag<
  DatabaseReaderService<DatabaseSchema_>,
  DatabaseReaderService<DatabaseSchema_>
>;

export const DatabaseReader = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>(): DatabaseReaderTag<DatabaseSchema_> =>
  Context.GenericTag<DatabaseReaderService<DatabaseSchema_>>(
    "@confect/server/DatabaseReader",
  );

export type DatabaseReader<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseReaderService<DatabaseSchema_>;

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
