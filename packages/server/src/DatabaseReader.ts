import * as Record from "effect/Record";
import type {
  GenericDatabaseReader,
  GenericDataModel,
  SystemDataModel,
} from "convex/server";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type { BaseDatabaseReader, IsUnion } from "@confect/core/Types";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as QueryInitializer from "./QueryInitializer";
import * as Table from "./Table";
import type { TableInfo } from "./TableInfo";
import type { FullIndexScan } from "./internal/FullIndexScan";

type IncludedTables<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  | DatabaseSchema.Tables<DatabaseSchema_>
  | Table.SystemTables;

type ReadDocument<
  Table_ extends Table.AnyWithProps,
  Docs,
> = Table_ extends unknown
  ? Table.Name<Table_> extends keyof Docs
    ? Docs[Table.Name<Table_>]
    : TableInfo<Table_>["document"]
  : never;

type SingleTableReader<
  Table_ extends Table.AnyWithProps,
  Docs,
> = Table_ extends unknown
  ? QueryInitializer.QueryInitializer<
      DataModel.FromTables<Table_>,
      Table.Name<Table_>,
      ReadDocument<Table_, Docs>
    >
  : never;

type SharedIndexes<Table_ extends Table.AnyWithProps> =
  TableInfo<Table_>["indexes"];

type SharedStreamIndex<Table_ extends Table.AnyWithProps> = {
  [Index in keyof SharedIndexes<Table_> & string]: true extends IsUnion<
    SharedIndexes<Table_>[Index]
  >
    ? never
    : Index;
}[keyof SharedIndexes<Table_> & string];

type TableReader<Table_ extends Table.AnyWithProps, Docs> =
  true extends IsUnion<Table.Name<Table_>>
    ? Pick<SingleTableReader<Table_, Docs>, "get" | "search"> &
        FullIndexScan<
          TableInfo<Table_>,
          ReadDocument<Table_, Docs>,
          SharedStreamIndex<Table_>
        >
    : SingleTableReader<Table_, Docs>;

export interface DatabaseReaderService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  readonly table: <Table_ extends IncludedTables<DatabaseSchema_>>(
    table: Table_,
  ) => TableReader<
    Table.WithName<IncludedTables<DatabaseSchema_>, Table.Name<Table_>>,
    Docs
  >;
}

type NativeTable<
  Model extends GenericDataModel,
  Table_ extends Table.AnyWithProps,
> = Table_ extends { readonly tableName: infer Name extends keyof Model }
  ? Table_ & {
      readonly [K in "indexes" | "searchIndexes"]: {
        [Index in keyof Table_[K]]: Index extends keyof Model[Name][K]
          ? Model[Name][K][Index]
          : never;
      };
    }
  : never;

export interface NativeReader<Model extends GenericDataModel> {
  readonly table: <
    Table_ extends IncludedTables<DatabaseSchema.FromConvexDataModel<Model>>,
  >(
    table: Table_ & NativeTable<Model & SystemDataModel, Table_>,
  ) => TableReader<Table_, {}>;
}

export const make = <Model extends GenericDataModel>(
  convexDatabaseReader: GenericDatabaseReader<Model>,
): NativeReader<Model> =>
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
  }) as NativeReader<Model>;

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
  Layer.succeed(
    DatabaseReader<DatabaseSchema_>(),
    make(convexDatabaseReader) as DatabaseReaderService<DatabaseSchema_>,
  );
