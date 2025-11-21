import type { GenericDatabaseReader } from "convex/server";
import { Array, Context, Layer, Struct } from "effect";
import type { BaseDatabaseReader } from "../typeUtils";
import type { DataModelFromConfectDataModel } from "./ConfectDataModel";
import * as ConfectQueryInitializer from "./ConfectQueryInitializer";
import type {
  ConfectDataModelFromConfectSchema,
  ExtendWithConfectSystemSchema,
  GenericConfectSchemaDefinition,
  TableNamesInConfectSchema,
} from "./ConfectSchema";
import {
  confectSystemSchema,
  extendWithConfectSystemSchema,
} from "./ConfectSchema";

export const make = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseReader: GenericDatabaseReader<
    DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<
        ConfectSchemaDefinition["confectSchema"]
      >
    >
  >,
) => {
  type ConfectSchema = ConfectSchemaDefinition["confectSchema"];

  type ConfectSchemaWithSystemTables =
    ExtendWithConfectSystemSchema<ConfectSchema>;

  return {
    table: <
      TableName extends
        TableNamesInConfectSchema<ConfectSchemaWithSystemTables>,
    >(
      tableName: TableName,
    ) => {
      const confectTableDefinition = extendWithConfectSystemSchema(
        confectSchemaDefinition.confectSchema,
      )[tableName] as ConfectSchemaWithSystemTables[TableName];

      const baseDatabaseReader: BaseDatabaseReader<
        DataModelFromConfectDataModel<
          ConfectDataModelFromConfectSchema<ConfectSchemaWithSystemTables>
        >
      > = Array.some(
        Struct.keys(confectSystemSchema),
        (systemTableName) => systemTableName === tableName,
      )
        ? {
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          }
        : {
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          };

      return ConfectQueryInitializer.make<
        ConfectSchemaWithSystemTables,
        TableName
      >(tableName, baseDatabaseReader, confectTableDefinition);
    },
  };
};

export const ConfectDatabaseReader = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>() =>
  Context.GenericTag<ReturnType<typeof make<ConfectSchemaDefinition>>>(
    "@rjdellecese/confect/ConfectDatabaseReader",
  );

export type ConfectDatabaseReader<
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
> = ReturnType<
  typeof ConfectDatabaseReader<ConfectSchemaDefinition>
>["Service"];

export const layer = <
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchemaDefinition,
  convexDatabaseReader: GenericDatabaseReader<
    DataModelFromConfectDataModel<
      ConfectDataModelFromConfectSchema<
        ConfectSchemaDefinition["confectSchema"]
      >
    >
  >,
) =>
  Layer.succeed(
    ConfectDatabaseReader<ConfectSchemaDefinition>(),
    make(confectSchemaDefinition, convexDatabaseReader),
  );
