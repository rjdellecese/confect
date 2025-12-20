import type { GenericDatabaseReader } from "convex/server";
import { Array, Context, Layer } from "effect";
import type { BaseDatabaseReader } from "../typeUtils";
import type * as ConfectDataModel from "./ConfectDataModel";
import * as ConfectQueryInitializer from "./ConfectQueryInitializer";
import * as ConfectSchema from "./ConfectSchema";
import * as ConfectTable from "./ConfectTable";

export const make = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
>(
  schema: ConfectSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    ConfectDataModel.ConfectDataModel.DataModel<
      ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
    >
  >,
) => {
  type Tables = ConfectSchema.ConfectSchema.Tables<ConfectSchema_>;
  type IncludedTables = ConfectSchema.IncludeConfectSystemTables<Tables>;
  const extendedTables = ConfectSchema.extendWithConfectSystemTables(
    schema.tables as ConfectTable.ConfectTable.TablesRecord<Tables>,
  );

  return {
    table: <
      const TableName extends ConfectTable.ConfectTable.Name<IncludedTables>,
    >(
      tableName: TableName,
    ) => {
      const confectTable = Object.values(extendedTables).find(
        (def) => def.name === tableName,
      ) as ConfectTable.ConfectTable.WithName<IncludedTables, TableName>;

      const baseDatabaseReader: BaseDatabaseReader<any> = Array.some(
        Object.values(ConfectTable.confectSystemTables),
        (systemTableDef) => systemTableDef.name === tableName,
      )
        ? ({
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          } as BaseDatabaseReader<
            ConfectDataModel.ConfectDataModel.DataModel<
              ConfectDataModel.ConfectDataModel.FromTables<ConfectTable.ConfectSystemTables>
            >
          >)
        : ({
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          } as BaseDatabaseReader<
            ConfectDataModel.ConfectDataModel.DataModel<
              ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
            >
          >);

      return ConfectQueryInitializer.make<IncludedTables, TableName>(
        tableName,
        baseDatabaseReader,
        confectTable,
      );
    },
  };
};

export const ConfectDatabaseReader = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<ConfectSchema_>>>(
    "@rjdellecese/confect/ConfectDatabaseReader",
  );

export type ConfectDatabaseReader<
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
> = ReturnType<typeof ConfectDatabaseReader<ConfectSchema_>>["Service"];

export const layer = <
  ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
>(
  schema: ConfectSchema_,
  convexDatabaseReader: GenericDatabaseReader<
    ConfectDataModel.ConfectDataModel.DataModel<
      ConfectDataModel.ConfectDataModel.FromSchema<ConfectSchema_>
    >
  >,
) =>
  Layer.succeed(
    ConfectDatabaseReader<ConfectSchema_>(),
    make(schema, convexDatabaseReader),
  );
