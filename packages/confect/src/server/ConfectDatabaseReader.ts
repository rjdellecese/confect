import type { GenericDatabaseReader } from "convex/server";
import { Array, Context, Layer } from "effect";
import type { DataModelFromConfectDataModel } from "./ConfectDataModel";
import * as ConfectQueryInitializer from "./ConfectQueryInitializer";
import type {
  ConfectDataModelFromConfectSchema,
  ConfectTableDefinitionFromConfectSchema,
  ExtendWithConfectSystemSchema,
  GenericConfectSchemaDefinition,
  TableNamesInConfectSchema,
} from "./ConfectSchema";
import {
  confectSystemTableDefinitions,
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
  type ConfectSchema = ExtendWithConfectSystemSchema<
    ConfectSchemaDefinition["confectSchema"]
  >;

  return {
    table: <TableName extends TableNamesInConfectSchema<ConfectSchema>>(
      tableName: TableName,
    ) => {
      const extendedSchema = extendWithConfectSystemSchema(
        confectSchemaDefinition.confectSchema,
      );
      const confectTableDefinition = extendedSchema.find(
        (def) => def.name === tableName,
      ) as ConfectTableDefinitionFromConfectSchema<
        ExtendWithConfectSystemSchema<ConfectSchema>,
        TableName
      >;

      const baseDatabaseReader = Array.some(
        confectSystemTableDefinitions,
        (systemTableDef) => systemTableDef.name === tableName,
      )
        ? {
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          }
        : {
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          };

      return ConfectQueryInitializer.make(
        tableName,
        baseDatabaseReader,
        confectTableDefinition,
      );
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
