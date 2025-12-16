import type {
  GenericDocument,
  GenericFieldPaths,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
} from "convex/server";
import type { Schema } from "effect";
import type * as ConfectDocument from "./ConfectDocument";
import type * as ConfectSchema from "./ConfectSchema";
import type * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";

export declare const TypeId: "@rjdellecese/confect/ConfectDataModel";
export type TypeId = typeof TypeId;

export interface ConfectDataModel<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly tables: {
    [TableName in Tables["name"]]: ConfectTable.ConfectTable.WithName<
      Tables,
      TableName
    >;
  };
}

export declare namespace ConfectDataModel {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps extends Any {
    readonly tables: Record<string, ConfectTable.ConfectTable.AnyWithProps>;
  }

  export type FromSchema<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  > = ConfectDataModel<ConfectSchema.ConfectSchema.Tables<ConfectSchema_>>;

  export type FromTables<
    Tables_ extends ConfectTable.ConfectTable.AnyWithProps,
  > = ConfectDataModel<Tables_>;

  export type DataModel<ConfectDataModel_ extends AnyWithProps> = {
    [TableName in TableNames<ConfectDataModel_>]: ConfectTableInfo.ConfectTableInfo.TableInfo<
      ConfectTableInfo.ConfectTableInfo<
        TableWithName<ConfectDataModel_, TableName>
      >
    >;
  };

  export type Tables<ConfectDataModel_ extends AnyWithProps> =
    ConfectDataModel_["tables"];

  export type TableNames<ConfectDataModel_ extends AnyWithProps> =
    keyof Tables<ConfectDataModel_> & string;

  export type TableWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = Tables<ConfectDataModel_>[TableName];

  export type ConfectTableInfoWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTableInfo.ConfectTableInfo<
    TableWithName<ConfectDataModel_, TableName>
  >;

  export type TableInfoWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTableInfo.ConfectTableInfo.TableInfo<
    ConfectTableInfoWithName<ConfectDataModel_, TableName>
  >;

  export type ConfectDocumentWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTableInfo.ConfectTableInfo.ConfectDocument<
    TableWithName<ConfectDataModel_, TableName>
  >;
}

export type ConfectDocumentByName<
  ConfectDataModel_ extends ConfectDataModel.AnyWithProps,
  TableName extends ConfectDataModel.TableNames<ConfectDataModel_>,
> = ConfectTableInfo.ConfectTableInfo.ConfectDocument<
  ConfectDataModel.ConfectTableInfoWithName<ConfectDataModel_, TableName>
>;

export type GenericConfectDataModel = Record<string, GenericConfectTableInfo>;

export type DataModelFromConfectDataModel<
  ConfectDataModel_ extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel_ &
    string]: TableInfoFromConfectTableInfo<ConfectDataModel_[TableName]>;
};

export type TableNamesInConfectDataModel<
  ConfectDataModel_ extends ConfectDataModel.AnyWithProps,
> = keyof ConfectDataModel_["tables"] & string;

export type TableInfoFromConfectTableInfo<
  ConfectTableInfo_ extends GenericConfectTableInfo,
> = {
  document: ConfectTableInfo_["convexDocument"];
  fieldPaths: ConfectTableInfo_["fieldPaths"];
  indexes: ConfectTableInfo_["indexes"];
  searchIndexes: ConfectTableInfo_["searchIndexes"];
  vectorIndexes: ConfectTableInfo_["vectorIndexes"];
};

export type GenericConfectTableInfo = {
  confectDocument: GenericConfectDoc<any, any>;
  encodedConfectDocument: ConfectDocument.ConfectDocument.GenericEncoded;
  convexDocument: GenericDocument;
  fieldPaths: GenericFieldPaths;
  indexes: GenericTableIndexes;
  searchIndexes: GenericTableSearchIndexes;
  vectorIndexes: GenericTableVectorIndexes;
};

export type TableSchemaFromConfectTableInfo<
  ConfectTableInfo_ extends GenericConfectTableInfo,
> = Schema.Schema<
  ConfectTableInfo_["confectDocument"],
  ConfectTableInfo_["encodedConfectDocument"]
>;

/**
 * The Confect document encoded for storage in Convex. This is the data as it is stored in the database.
 */
export type GenericConfectDoc<
  ConfectDataModel_ extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel_>,
> = ConfectDataModel_[TableName]["encodedConfectDocument"];
