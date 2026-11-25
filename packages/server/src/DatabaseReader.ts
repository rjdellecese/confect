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

/**
 * Service for reading decoded documents in queries and mutations. Yield the
 * generated `DatabaseReader` tag and pass a bound table handle to `table`; the
 * handle supplies the codec, and `Docs` optionally supplies named document
 * types.
 *
 * **Example** (Reading the ten newest notes)
 *
 * ```ts
 * import * as Effect from "effect/Effect";
 * import { DatabaseReader } from "confect/_generated/services";
 * import notesTable from "confect/_generated/tables/notes";
 *
 * export const latestNotes = Effect.gen(function* () {
 *   const reader = yield* DatabaseReader;
 *   return yield* reader
 *     .table(notesTable)
 *     .index("by_creation_time", "desc")
 *     .take(10);
 * });
 * ```
 *
 * @remarks
 *   Codegen support: this interface names the generated service shape; do not
 *   import it directly. Yield `DatabaseReader` from
 *   `confect/_generated/services` and call `reader.table(handle)`.
 *
 * @category Services
 */
export interface DatabaseReaderService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = unknown,
> {
  /**
   * Selects a bound application or system table for lookups and queries without
   * reading any documents.
   *
   * **Gotchas**
   *
   * If the handle can refer to several tables, `index(name, order?)` accepts
   * shared index names, but `stream(name, order?)` also requires identical
   * fields in the same order. Narrow the handle by `tableName` before using a
   * table-specific index, range callback, or ID.
   *
   * @category Reading
   *
   * @param table - A bound application table from `_generated/tables/<name>`,
   *   or a read-only system handle from `@confect/server/Table`: `_storage` or
   *   `_scheduled_functions`.
   *
   * @returns The lookup and query operations available on the selected handle.
   *
   * @see {@link QueryInitializer.QueryInitializer} for lookups and queries on a single table.
   */
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

/**
 * @internal
 */
export interface NativeReader<Model extends GenericDataModel> {
  readonly table: <
    Table_ extends IncludedTables<DatabaseSchema.FromConvexDataModel<Model>>,
  >(
    table: Table_ & NativeTable<Model & SystemDataModel, Table_>,
  ) => TableReader<Table_, unknown>;
}

/**
 * @internal
 */
export const make = <Model extends GenericDataModel>(
  convexDatabaseReader: GenericDatabaseReader<Model>,
): NativeReader<Model> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The reader's public result distributes over matching table handles and exposes only indexes shared by a union; the native builder cannot express that conditional return.
  ({
    table: (table) => {
      // oxlint-disable-next-line typescript/no-explicit-any -- The handle selects the matching application or system reader. Convex models are invariant in index ranges; treating either as GenericDataModel would admit invalid indexes.
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
 *
 * Annotates the generated `DatabaseReader` tag. For an Effect requirement,
 * import the type `DatabaseReader` from `confect/_generated/services` instead
 * of naming this tag type.
 *
 * @internal
 */
export type DatabaseReaderTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = unknown,
> = Context.Service<
  DatabaseReaderService<DatabaseSchema_>,
  DatabaseReaderService<DatabaseSchema_, Docs>
>;

/**
 * Constructs the schema-specific tag for generated services. Import
 * `DatabaseReader` from `confect/_generated/services` and yield it rather than
 * calling this factory.
 *
 * @internal
 */
export const DatabaseReader = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = unknown,
>(): DatabaseReaderTag<DatabaseSchema_, Docs> =>
  Context.Service<
    DatabaseReaderService<DatabaseSchema_>,
    DatabaseReaderService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseReader");

/**
 * Service requirement for effects that read from this database schema. Yield
 * `DatabaseReader` from `confect/_generated/services` and call
 * `reader.table(handle)` to read the application's named document types.
 *
 * @category Services
 */
export type DatabaseReader<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseReaderService<DatabaseSchema_>;

/**
 * @internal
 */
export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  convexDatabaseReader: GenericDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(
    DatabaseReader<DatabaseSchema_>(),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The generated service uses this exact schema's model; rebuilding table types from the native reader loses the schema's named document identities.
    make(convexDatabaseReader) as DatabaseReaderService<DatabaseSchema_>,
  );
