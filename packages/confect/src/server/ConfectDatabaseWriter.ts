import type {
  BetterOmit,
  DocumentByName,
  Expand,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, Layer, pipe, Record } from "effect";
import type {
  ConfectDocumentByName,
  DataModelFromConfectDataModel,
  TableNamesInConfectDataModel,
  TableSchemaFromConfectTableInfo,
} from "./ConfectDataModel";
import * as ConfectDocument from "./ConfectDocument";
import * as ConfectQueryInitializer from "./ConfectQueryInitializer";
import type { DataModelFromConfectSchemaDefinition } from "./ConfectSchema";
import {
  type ConfectDataModelFromConfectSchemaDefinition,
  type GenericConfectSchemaDefinition,
} from "./ConfectSchema";

export const make = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>
  >,
) => {
  type ConfectDataModel =
    ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>;

  const insert = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    document: WithoutSystemFields<
      ConfectDocumentByName<ConfectDataModel, TableName>
    >,
  ) =>
    Effect.gen(function* () {
      const confectTableDefinition = confectSchemaDefinition.confectSchema.find(
        (def) => def.name === tableName,
      )!;

      const encodedDocument = yield* ConfectDocument.encode(
        document,
        tableName,
        confectTableDefinition.fields,
      );

      const id = yield* Effect.promise(() =>
        convexDatabaseWriter.insert(
          tableName,
          encodedDocument as Expand<
            BetterOmit<
              DocumentByName<
                DataModelFromConfectDataModel<ConfectDataModel>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );

      return id;
    });

  const patch = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    id: GenericId<TableName>,
    patchedValues: Partial<
      WithoutSystemFields<ConfectDocumentByName<ConfectDataModel, TableName>>
    >,
  ) =>
    Effect.gen(function* () {
      const confectTableDefinition = confectSchemaDefinition.confectSchema.find(
        (def) => def.name === tableName,
      )!;

      const tableSchema =
        confectTableDefinition.fields as TableSchemaFromConfectTableInfo<
          ConfectDataModel[TableName]
        >;

      const originalDecodedDoc = yield* ConfectQueryInitializer.getById(
        tableName,
        convexDatabaseWriter,
        confectTableDefinition,
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
                DataModelFromConfectDataModel<ConfectDataModel>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

  const replace = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  >(
    tableName: TableName,
    id: GenericId<TableName>,
    value: WithoutSystemFields<
      ConfectDocumentByName<ConfectDataModel, TableName>
    >,
  ) =>
    Effect.gen(function* () {
      const confectTableDefinition = confectSchemaDefinition.confectSchema.find(
        (def) => def.name === tableName,
      )!;

      const tableSchema =
        confectTableDefinition.fields as TableSchemaFromConfectTableInfo<
          ConfectDataModel[TableName]
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
                DataModelFromConfectDataModel<ConfectDataModel>,
                TableName
              >,
              "_creationTime" | "_id"
            >
          >,
        ),
      );
    });

  const delete_ = <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
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
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>() =>
  Context.GenericTag<ReturnType<typeof make<ConfectSchemaDefinition>>>(
    "@rjdellecese/confect/ConfectDatabaseWriter",
  );

export type ConfectDatabaseWriter<
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
> = ReturnType<
  typeof ConfectDatabaseWriter<ConfectSchemaDefinition>
>["Service"];

export const layer = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseWriter: GenericDatabaseWriter<
    DataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>
  >,
) =>
  Layer.succeed(
    ConfectDatabaseWriter<ConfectSchemaDefinition>(),
    make(confectSchemaDefinition, convexDatabaseWriter),
  );
