import type {
  BetterOmit,
  DocumentByName,
  Expand,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, Layer, pipe, Record } from "effect";
import type * as ConfectDataModel from "./ConfectDataModel";
import type {
  ConfectDocumentByName,
  TableNamesInConfectDataModel,
} from "./ConfectDataModel";
import * as ConfectDocument from "./ConfectDocument";
import * as ConfectQueryInitializer from "./ConfectQueryInitializer";
import type * as ConfectSchema from "./ConfectSchema";
import type * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";

export const make = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
>(
  schema: ConfectSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    ConfectSchema.DataModelFromConfectSchema<ConfectSchema_>
  >,
) => {
  type ConfectDataModel_ =
    ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>;

  const insert = <
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    tableName: TableName,
    document: ConfectDocument.ConfectDocument.WithoutSystemFields<
      ConfectDocumentByName<ConfectDataModel_, TableName>
    >,
  ) =>
    Effect.gen(function* () {
      const confectTable = (
        schema.tables as Record<string, ConfectTable.ConfectTable.AnyWithProps>
      )[tableName]!;

      const encodedDocument = yield* ConfectDocument.encode(
        document,
        tableName,
        confectTable.Fields,
      );

      const id = yield* Effect.promise(() =>
        convexDatabaseWriter.insert(
          tableName,
          encodedDocument as WithoutSystemFields<
            DocumentByName<
              ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>,
              TableName
            >
          >,
        ),
      );

      return id;
    });

  const patch = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel_>,
  >(
    tableName: TableName,
    id: GenericId<TableName>,
    patchedValues: Partial<
      WithoutSystemFields<ConfectDocumentByName<ConfectDataModel_, TableName>>
    >,
  ) =>
    Effect.gen(function* () {
      const confectTable = (
        schema.tables as Record<string, ConfectTable.ConfectTable.AnyWithProps>
      )[tableName]!;

      const tableSchema =
        confectTable.Fields as ConfectTableInfo.ConfectTableInfo.TableSchema<
          ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
            ConfectDataModel_,
            TableName
          >
        >;

      const originalDecodedDoc = yield* ConfectQueryInitializer.getById(
        tableName,
        convexDatabaseWriter as any,
        confectTable,
      )(id);

      const updatedEncodedDoc = yield* pipe(
        patchedValues,
        Record.reduce(originalDecodedDoc, (acc, value, key) =>
          value === undefined
            ? Record.remove(acc, key)
            : Record.set(acc, key, value),
        ),
        ConfectDocument.encode(tableName, tableSchema),
      );

      yield* Effect.promise(() =>
        convexDatabaseWriter.replace(
          id,
          updatedEncodedDoc as Expand<
            BetterOmit<
              DocumentByName<
                ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

  const replace = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel_>,
  >(
    tableName: TableName,
    id: GenericId<TableName>,
    value: WithoutSystemFields<
      ConfectDocumentByName<ConfectDataModel_, TableName>
    >,
  ) =>
    Effect.gen(function* () {
      const confectTable = (
        schema.tables as Record<string, ConfectTable.ConfectTable.AnyWithProps>
      )[tableName]!;

      const tableSchema =
        confectTable.Fields as ConfectTableInfo.ConfectTableInfo.TableSchema<
          ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
            ConfectDataModel_,
            TableName
          >
        >;

      const updatedEncodedDoc = yield* ConfectDocument.encode(
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
                ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

  const delete_ = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel_>,
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

export const ConfectDatabaseWriter = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<ConfectSchema_>>>(
    "@rjdellecese/confect/ConfectDatabaseWriter",
  );

export type ConfectDatabaseWriter<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
> = ReturnType<typeof ConfectDatabaseWriter<ConfectSchema_>>["Service"];

export const layer = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
>(
  schema: ConfectSchema_,
  convexDatabaseWriter: GenericDatabaseWriter<
    ConfectSchema.DataModelFromConfectSchema<ConfectSchema_>
  >,
) =>
  Layer.succeed(
    ConfectDatabaseWriter<ConfectSchema_>(),
    make(schema, convexDatabaseWriter),
  );
