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

export const make = <Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps>(
  schema: Schema,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
  >,
) => {
  type DataModel_ = DataModel.DataModel.FromSchema<Schema>;

  const insert = <TableName extends DataModel.DataModel.TableNames<DataModel_>>(
    tableName: TableName,
    document: Document.Document.WithoutSystemFields<
      DocumentByName_<DataModel_, TableName>
    >,
  ) =>
    Effect.gen(function* () {
      const table = (schema.tables as Record<string, Table.Table.AnyWithProps>)[
        tableName
      ]!;

      const encodedDocument = yield* Document.encode(
        document,
        tableName,
        table.Fields,
      );

      const id = yield* Effect.promise(() =>
        convexDatabaseWriter.insert(
          tableName,
          encodedDocument as WithoutSystemFields<
            DocumentByName<DataModel.DataModel.ToConvex<DataModel_>, TableName>
          >,
        ),
      );

      return id;
    });

  const patch = <TableName extends DataModel.DataModel.TableNames<DataModel_>>(
    tableName: TableName,
    id: GenericId<TableName>,
    patchedValues: Partial<
      WithoutSystemFields<DocumentByName_<DataModel_, TableName>>
    >,
  ) =>
    Effect.gen(function* () {
      const table = (schema.tables as Record<string, Table.Table.AnyWithProps>)[
        tableName
      ]!;

      const tableSchema = table.Fields as TableInfo.TableInfo.TableSchema<
        DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
      >;

      const originalDecodedDoc = yield* QueryInitializer.getById(
        tableName,
        convexDatabaseWriter as any,
        table,
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
              DocumentByName<
                DataModel.DataModel.ToConvex<DataModel_>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

  const replace = <
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    tableName: TableName,
    id: GenericId<TableName>,
    value: WithoutSystemFields<DocumentByName_<DataModel_, TableName>>,
  ) =>
    Effect.gen(function* () {
      const table = (schema.tables as Record<string, Table.Table.AnyWithProps>)[
        tableName
      ]!;

      const tableSchema = table.Fields as TableInfo.TableInfo.TableSchema<
        DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
      >;

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
              DocumentByName<
                DataModel.DataModel.ToConvex<DataModel_>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

  const delete_ = <
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    _tableName: TableName,
    id: GenericId<TableName>,
  ) => Effect.promise(() => convexDatabaseWriter.delete(id));

  return {
    insert,
    patch,
    replace,
    delete: delete_,
  };
};

export const DatabaseWriter = <
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<Schema>>>(
    "@rjdellecese/confect/server/DatabaseWriter",
  );

export type DatabaseWriter<
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
> = ReturnType<typeof DatabaseWriter<Schema>>["Identifier"];

export const layer = <
  Schema extends DatabaseSchema.DatabaseSchema.AnyWithProps,
>(
  schema: Schema,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModel.DataModel.ToConvex<DataModel.DataModel.FromSchema<Schema>>
  >,
) =>
  Layer.succeed(DatabaseWriter<Schema>(), make(schema, convexDatabaseWriter));
