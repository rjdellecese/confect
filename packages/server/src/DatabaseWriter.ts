import type {
  BetterOmit,
  DocumentByName,
  Expand,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, Layer, pipe, Record } from "effect";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type { DocumentByName as DocumentByName_ } from "./DataModel";
import * as Document from "./Document";
import * as QueryInitializer from "./QueryInitializer";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";

export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  databaseSchema: DatabaseSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.ToConvex<DataModel.FromSchema<DatabaseSchema_>>
  >,
) => {
  type DataModel_ = DataModel.FromSchema<DatabaseSchema_>;
  const tables = databaseSchema.tables as Record<string, Table.AnyWithProps>;

  const table = <const TableName extends DataModel.TableNames<DataModel_>>(
    tableName: TableName,
  ) => {
    const tableDef = tables[tableName]!;
    const tableSchema = tableDef.Fields as TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
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
          tableSchema,
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

  return {
    table,
  };
};

export const DatabaseWriter = <
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<DatabaseSchema_>>>(
    "@confect/server/DatabaseWriter",
  );

export type DatabaseWriter<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = ReturnType<typeof DatabaseWriter<DatabaseSchema_>>["Identifier"];

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
