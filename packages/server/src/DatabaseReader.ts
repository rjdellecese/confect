import * as Record from "effect/Record";
import type { GenericDatabaseReader, GenericDataModel } from "convex/server";
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

type TableReader<
  Table_ extends Table.AnyWithProps,
  Docs,
> = Table_ extends unknown
  ? QueryInitializer.QueryInitializer<
      DataModel.FromTables<Table_>,
      Table.Name<Table_>,
      Table.Name<Table_> extends keyof Docs
        ? Docs[Table.Name<Table_>]
        : DataModel.DocumentWithName<
            DataModel.FromTables<Table_>,
            Table.Name<Table_>
          >
    >
  : never;

export interface DatabaseReaderService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  readonly table: <Table_ extends IncludedTables<DatabaseSchema_>>(
    table: Table_,
  ) => TableReader<Table_, Docs>;
}

export const make = <Model extends GenericDataModel>(
  convexDatabaseReader: GenericDatabaseReader<Model>,
): DatabaseReaderService<DatabaseSchema.FromConvexDataModel<Model>> =>
  ({
    table: (table) => {
      const reader: BaseDatabaseReader<any> = Record.has<string, unknown>(
        Table.systemTables,
        table.tableName,
      )
        ? convexDatabaseReader.system
        : convexDatabaseReader;
      return QueryInitializer.make<Table.AnyWithProps, string>(reader, table);
    },
  }) as DatabaseReaderService<DatabaseSchema.FromConvexDataModel<Model>>;

/**
 * The tag's _Identifier_ (the Effect requirements-channel type) is
 * `Docs`-independent so a helper's `R` channel is the same whether or not a
 * codegen document registry is supplied—this keeps it identical to what
 * `Handler`/runtime provisioning provide. The tag's _Service_ (what `yield*`
 * produces) carries `Docs`, so queries resolve to the named doc interfaces.
 */
export type DatabaseReaderTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Service<
  DatabaseReaderService<DatabaseSchema_>,
  DatabaseReaderService<DatabaseSchema_, Docs>
>;

export const DatabaseReader = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseReaderTag<DatabaseSchema_, Docs> =>
  Context.Service<
    DatabaseReaderService<DatabaseSchema_>,
    DatabaseReaderService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseReader");

export type DatabaseReader<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseReaderService<DatabaseSchema_>;

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(DatabaseReader<DatabaseSchema_>(), make(convexDatabaseReader));
