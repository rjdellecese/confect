import * as Record from "effect/Record";
import type { GenericDatabaseReader } from "convex/server";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type { BaseDatabaseReader } from "@confect/core/Types";
import * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import * as QueryInitializer from "./QueryInitializer";
import * as Table from "./Table";

type IncludedTables<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  | DatabaseSchema.Tables<DatabaseSchema_>
  | Table.SystemTables;

type IncludedDataModel<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  DataModel.FromTables<IncludedTables<DatabaseSchema_>>;

/**
 * Schema-typed database reads acquired from the generated `DatabaseReader`
 * service in queries and mutations. `Docs` optionally supplies generated named
 * document types; reads still decode through each table's codec.
 *
 * @example
 *   import * as Effect from "effect/Effect";
 *   import { DatabaseReader } from "./confect/_generated/services";
 *
 *   const latestNotes = Effect.gen(function* () {
 *     const reader = yield* DatabaseReader;
 *     return yield* reader
 *       .table("notes")
 *       .index("by_creation_time", "desc")
 *       .take(10);
 *   });
 */
export interface DatabaseReaderService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  /**
   * Select a table for document lookup or query construction.
   *
   * @param tableName - A declared table, `_storage`, or `_scheduled_functions`.
   *
   * @returns The table's lookup and index/search/stream methods. Selecting a
   *   table does not itself fetch documents; system tables are read-only.
   */
  readonly table: <
    const TableName extends Table.Name<IncludedTables<DatabaseSchema_>>,
  >(
    tableName: TableName,
  ) => QueryInitializer.QueryInitializer<
    IncludedDataModel<DatabaseSchema_>,
    TableName,
    TableName extends keyof Docs
      ? Docs[TableName]
      : DataModel.DocumentWithName<
          IncludedDataModel<DatabaseSchema_>,
          TableName
        >
  >;
}

/**
 * @internal
 */
export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
): DatabaseReaderService<DatabaseSchema_> =>
  ({
    table: <
      const TableName extends Table.Name<IncludedTables<DatabaseSchema_>>,
    >(
      tableName: TableName,
    ) => {
      const isSystem = Record.has(Table.systemTables, tableName);

      const baseDatabaseReader: BaseDatabaseReader<any> = isSystem
        ? {
            get: convexDatabaseReader.system.get.bind(
              convexDatabaseReader.system,
            ),
            query: convexDatabaseReader.system.query.bind(
              convexDatabaseReader.system,
            ),
          }
        : {
            get: convexDatabaseReader.get.bind(convexDatabaseReader),
            query: convexDatabaseReader.query.bind(convexDatabaseReader),
          };

      const table = (
        isSystem
          ? (Table.systemTables as Record<string, Table.AnyWithProps>)[
              tableName
            ]
          : DatabaseSchema.tables(databaseSchema)[tableName]
      ) as Table.WithName<IncludedTables<DatabaseSchema_>, TableName>;

      return QueryInitializer.make<IncludedTables<DatabaseSchema_>, TableName>(
        baseDatabaseReader,
        table,
      );
    },
  }) as DatabaseReaderService<DatabaseSchema_>;

/**
 * The tag's _Identifier_ (the Effect requirements-channel type) is
 * `Docs`-independent so a helper's `R` channel is the same whether or not a
 * codegen document registry is supplied—this keeps it identical to what
 * `Handler`/runtime provisioning provide. The tag's _Service_ (what `yield*`
 * produces) carries `Docs`, so queries resolve to the named doc interfaces.
 *
 * @internal
 */
export type DatabaseReaderTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Service<
  DatabaseReaderService<DatabaseSchema_>,
  DatabaseReaderService<DatabaseSchema_, Docs>
>;

/**
 * @internal
 */
export const DatabaseReader = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseReaderTag<DatabaseSchema_, Docs> =>
  Context.Service<
    DatabaseReaderService<DatabaseSchema_>,
    DatabaseReaderService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseReader");

/**
 * The database reader service requirement and uncustomized service shape for a
 * schema. Acquire the generated service tag rather than invoking the raw
 * same-named factory; use {@link DatabaseReaderService} for a named-doc
 * registry.
 */
export type DatabaseReader<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseReaderService<DatabaseSchema_>;

/**
 * @internal
 */
export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(
    DatabaseReader<DatabaseSchema_>(),
    make(databaseSchema, convexDatabaseReader),
  );
