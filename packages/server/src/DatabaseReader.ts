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

type IncludedDataModel<DatabaseSchema_ extends DatabaseSchema.AnyWithProps> =
  DataModel.DataModel<IncludedTables<DatabaseSchema_>>;

/**
 * The service shape backing the `DatabaseReader` tag. Named (rather than an
 * inferred anonymous object) so that declaration emit prints
 * `DatabaseReaderService<…>` by reference instead of expanding the entire data
 * model — both in `_generated/services.d.ts` and in every user helper's Effect
 * requirements channel.
 *
 * `Docs` is an optional named document registry (emitted by codegen). When a
 * table is present in it, queries resolve to its *named* doc interface so
 * declaration emit prints e.g. `NotesDoc`; otherwise it falls back to the
 * schema-derived structural document (the default, structurally identical).
 */
export interface DatabaseReaderService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  readonly table: <
    const TableName extends Table.Name<IncludedTables<DatabaseSchema_>>,
  >(
    tableName: TableName,
  ) => QueryInitializer.QueryInitializer<
    IncludedDataModel<DatabaseSchema_>,
    TableName,
    DataModel.TableInfoWithName<IncludedDataModel<DatabaseSchema_>, TableName>,
    DataModel.TableInfoWithName_<IncludedDataModel<DatabaseSchema_>, TableName>,
    TableName extends keyof Docs
      ? Docs[TableName]
      : DataModel.DocumentWithName<
          IncludedDataModel<DatabaseSchema_>,
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
  return {
    table: <
      const TableName extends Table.Name<IncludedTables<DatabaseSchema_>>,
    >(
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
      ) as Table.WithName<IncludedTables<DatabaseSchema_>, TableName>;

      return QueryInitializer.make<IncludedTables<DatabaseSchema_>, TableName>(
        tableName,
        baseDatabaseReader,
        table,
      );
    },
    // The runtime accessor resolves the structural document for every table.
    // The `Docs`-conditional return type is a declaration-emit refinement only
    // (structurally identical), which the generic `make` body cannot prove, so
    // assert it here.
  } as DatabaseReaderService<DatabaseSchema_>;
};

/**
 * The fully-applied tag type for a given schema. Codegen annotates its
 * `_generated/services.ts` export with this alias so declaration emit copies
 * `DatabaseReaderTag<typeof schemaDefinition, ConfectDocs>` verbatim — keeping
 * `typeof schemaDefinition` a reference instead of expanding the whole schema.
 *
 * The tag's *Identifier* (the Effect requirements-channel type) is
 * `Docs`-independent so a helper's `R` channel is the same whether or not a
 * codegen document registry is supplied — this keeps it identical to what
 * `Handler`/runtime provisioning provide. The tag's *Service* (what `yield*`
 * produces) carries `Docs`, so queries resolve to the named doc interfaces.
 */
export type DatabaseReaderTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Tag<
  DatabaseReaderService<DatabaseSchema_>,
  DatabaseReaderService<DatabaseSchema_, Docs>
>;

export const DatabaseReader = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseReaderTag<DatabaseSchema_, Docs> =>
  Context.GenericTag<
    DatabaseReaderService<DatabaseSchema_>,
    DatabaseReaderService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseReader");

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
