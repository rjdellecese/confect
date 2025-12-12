import type { GenericDatabaseReader } from "convex/server";
import { Array, Context, Layer } from "effect";
import type { BaseDatabaseReader } from "../typeUtils";
import * as ConfectQueryInitializer from "./ConfectQueryInitializer";
import * as ConfectSchema from "./ConfectSchema";
import * as ConfectTable from "./ConfectTable";

export const make = <S extends ConfectSchema.ConfectSchema.AnyWithProps>(
  schema: S,
  convexDatabaseReader: GenericDatabaseReader<
    ConfectSchema.DataModelFromConfectSchema<S>
  >,
) => {
  type Tables = ConfectSchema.ConfectSchema.Tables<S>;
  type ExtendedTables = ConfectSchema.ExtendWithConfectSystemTables<Tables>;
  const extendedTables: ExtendedTables =
    ConfectSchema.extendWithConfectSystemTables(
      schema.tables as {
        [K in Tables["name"]]: Extract<Tables, { name: K }>;
      },
    );

  return {
    table: <
      const TableName extends ConfectTable.ConfectTable.Name<ExtendedTables>,
    >(
      tableName: TableName,
    ) => {
      const confectTable = Object.values(extendedTables).find(
        (def) => def.name === tableName,
      );

      const baseDatabaseReader: BaseDatabaseReader<any> = Array.some(
        Object.values(ConfectTable.confectSystemTables),
        (systemTableDef) => systemTableDef.name === tableName,
      )
        ? ({
            get: convexDatabaseReader.system.get,
            query: convexDatabaseReader.system.query,
          } as BaseDatabaseReader<
            ConfectSchema.DataModelFromConfectTables<ConfectTable.ConfectSystemTables>
          >)
        : ({
            get: convexDatabaseReader.get,
            query: convexDatabaseReader.query,
          } as BaseDatabaseReader<ConfectSchema.DataModelFromConfectSchema<S>>);

      return ConfectQueryInitializer.make<ExtendedTables, TableName>(
        tableName,
        baseDatabaseReader,
        confectTable,
      );
    },
  };
};

export const ConfectDatabaseReader = <
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<S>>>(
    "@rjdellecese/confect/ConfectDatabaseReader",
  );

export type ConfectDatabaseReader<
  S extends ConfectSchema.ConfectSchema.AnyWithProps,
> = ReturnType<typeof ConfectDatabaseReader<S>>["Service"];

export const layer = <S extends ConfectSchema.ConfectSchema.AnyWithProps>(
  schema: S,
  convexDatabaseReader: GenericDatabaseReader<
    ConfectSchema.DataModelFromConfectSchema<S>
  >,
) =>
  Layer.succeed(ConfectDatabaseReader<S>(), make(schema, convexDatabaseReader));
