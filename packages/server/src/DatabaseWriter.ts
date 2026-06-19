import type {
  BetterOmit,
  DocumentByName,
  Expand,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import { pipe } from "effect/Function";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type { DocumentByName as DocumentByName_ } from "./DataModel";
import * as Document from "./Document";
import * as QueryInitializer from "./QueryInitializer";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";

export interface DatabaseWriterTableAccessor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DocumentByName_<DataModel_, TableName>,
> {
  readonly insert: (
    document: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<GenericId<TableName>, Document.DocumentEncodeError>;
  readonly patch: (
    id: GenericId<TableName>,
    patchedValues: Partial<Document.WithoutSystemFields<Doc>>,
  ) => Effect.Effect<
    void,
    | QueryInitializer.GetByIdFailure
    | Document.DocumentDecodeError
    | Document.DocumentEncodeError
  >;
  readonly replace: (
    id: GenericId<TableName>,
    value: Document.WithoutSystemFields<Doc>,
  ) => Effect.Effect<void, Document.DocumentEncodeError>;
  readonly delete: (id: GenericId<TableName>) => Effect.Effect<void>;
}

/**
 * The service shape backing the `DatabaseWriter` tag. Named (rather than an
 * inferred anonymous object) so declaration emit prints
 * `DatabaseWriterService<…>` by reference instead of expanding the data model.
 * `Docs` is the optional named document registry (see `DatabaseReaderService`).
 */
export interface DatabaseWriterService<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> {
  readonly table: <
    const TableName extends DataModel.TableNames<
      DataModel.FromSchema<DatabaseSchema_>
    >,
  >(
    tableName: TableName,
  ) => DatabaseWriterTableAccessor<
    DataModel.FromSchema<DatabaseSchema_>,
    TableName,
    TableName extends keyof Docs
      ? Docs[TableName]
      : DocumentByName_<DataModel.FromSchema<DatabaseSchema_>, TableName>
  >;
}

/**
 * The tag's *Identifier* is `Docs`-independent (see `DatabaseReaderTag`); only
 * the *Service* carries `Docs` so writer inputs print the named doc interfaces.
 */
export type DatabaseWriterTag<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
> = Context.Tag<
  DatabaseWriterService<DatabaseSchema_>,
  DatabaseWriterService<DatabaseSchema_, Docs>
>;

export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
): DatabaseWriterService<DatabaseSchema_> => {
  type DataModel_ = DataModel.FromSchema<DatabaseSchema_>;

  const table = <const TableName extends DataModel.TableNames<DataModel_>>(
    tableName: TableName,
  ) => {
    const tableDef = databaseSchema.tables[tableName] as Table.WithName<
      DatabaseSchema.Tables<DatabaseSchema_>,
      TableName
    >;

    const insert = (
      document: Document.WithoutSystemFields<
        DocumentByName_<DataModel_, TableName>
      >,
    ) =>
      Effect.gen(function* () {
        const encodedDocument = yield* Document.encode(
          document,
          tableName,
          tableDef.Fields,
        );

        const id = yield* Effect.promise(() =>
          convexDatabaseWriter.insert(
            tableName,
            encodedDocument as WithoutSystemFields<
              DocumentByName<DataModel.ToConvex<DataModel_>, TableName>
            >,
          ),
        );

        return id;
      });

    const patch = (
      id: GenericId<TableName>,
      patchedValues: Partial<
        WithoutSystemFields<DocumentByName_<DataModel_, TableName>>
      >,
    ) =>
      Effect.gen(function* () {
        const tableSchema = tableDef.Fields as TableInfo.TableSchema<
          DataModel.TableInfoWithName_<DataModel_, TableName>
        >;

        const originalDecodedDoc = yield* QueryInitializer.getById(
          tableName,
          convexDatabaseWriter as any,
          tableDef,
        )(id);

        const updatedEncodedDoc = yield* pipe(
          patchedValues,
          Record.reduce(originalDecodedDoc, (acc, value, key) =>
            value === undefined
              ? Record.remove(acc, key)
              : Record.set(acc, key, value),
          ),
          Document.encode(tableName, tableSchema),
        );

        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(
            id,
            updatedEncodedDoc as Expand<
              BetterOmit<
                DocumentByName<DataModel.ToConvex<DataModel_>, TableName>,
                "_creationTime" | "_id"
              >
            >,
          ),
        );
      });

    const replace = (
      id: GenericId<TableName>,
      value: WithoutSystemFields<DocumentByName_<DataModel_, TableName>>,
    ) =>
      Effect.gen(function* () {
        const updatedEncodedDoc = yield* Document.encode(
          value,
          tableName,
          tableDef.Fields,
        );

        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(
            id,
            updatedEncodedDoc as Expand<
              BetterOmit<
                DocumentByName<DataModel.ToConvex<DataModel_>, TableName>,
                "_creationTime" | "_id"
              >
            >,
          ),
        );
      });

    const delete_ = (id: GenericId<TableName>) =>
      Effect.promise(() => convexDatabaseWriter.delete(id));

    return {
      insert,
      patch,
      replace,
      delete: delete_,
    };
  };

  // The `Docs`-conditional document type is a declaration-emit refinement only
  // (structurally identical to the structural document), which the generic
  // `make` body cannot prove, so assert it here.
  return {
    table,
  } as DatabaseWriterService<DatabaseSchema_>;
};

export const DatabaseWriter = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Docs = {},
>(): DatabaseWriterTag<DatabaseSchema_, Docs> =>
  Context.GenericTag<
    DatabaseWriterService<DatabaseSchema_>,
    DatabaseWriterService<DatabaseSchema_, Docs>
  >("@confect/server/DatabaseWriter");

export type DatabaseWriter<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DatabaseWriterService<DatabaseSchema_>;

export const layer = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) =>
  Layer.succeed(
    DatabaseWriter<DatabaseSchema_>(),
    make(databaseSchema, convexDatabaseWriter),
  );
