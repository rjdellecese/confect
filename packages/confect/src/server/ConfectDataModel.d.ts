import type {
  GenericDocument,
  GenericFieldPaths,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
} from "convex/server";
import type { Schema } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import type * as ConfectSchema from "./ConfectSchema";
import type * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";
import type { ReadonlyValue } from "./SchemaToValidator";
import type { WithSystemFields } from "./SystemFields";

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

  export type AnyWithProps =
    ConfectDataModel<ConfectTable.ConfectTable.AnyWithProps>;

  export type FromSchema<S extends ConfectSchema.ConfectSchema.AnyWithProps> =
    ConfectDataModel<ConfectSchema.ConfectSchema.Tables<S>>;

  export type DataModel<ConfectDataModel extends AnyWithProps> = {
    [TableName in TableNames<ConfectDataModel>]: ConfectTableInfo.ConfectTableInfo.TableInfo<
      ConfectTableInfo.ConfectTableInfo<
        TableWithName<ConfectDataModel, TableName>
      >
    >;
  };

  export type Tables<ConfectDataModel extends AnyWithProps> =
    ConfectDataModel["tables"];

  export type TableNames<ConfectDataModel extends AnyWithProps> =
    keyof Tables<ConfectDataModel> & string;

  export type TableWithName<
    ConfectDataModel extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel>,
  > = Tables<ConfectDataModel>[TableName];

  export type ConfectTableInfoWithName<
    ConfectDataModel extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel>,
  > = ConfectTableInfo.ConfectTableInfo<
    TableWithName<ConfectDataModel, TableName>
  >;

  export type TableInfoWithName<
    ConfectDataModel extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel>,
  > = ConfectTableInfo.ConfectTableInfo.TableInfo<
    ConfectTableInfoWithName<ConfectDataModel, TableName>
  >;

  export type ConfectDocumentWithName<
    ConfectDataModel extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel>,
  > = ConfectTableInfo.ConfectTableInfo.ConfectDocument<
    TableWithName<ConfectDataModel, TableName>
  >;
}

export type GenericConfectDocumentWithSystemFields = WithSystemFields<
  string,
  GenericConfectDoc<any, any>
>;

export type GenericEncodedConfectDocument = ReadonlyRecord<
  string,
  ReadonlyValue
>;

export type ConfectDocumentByName<
  ConfectDataModel extends ConfectDataModel.AnyWithProps,
  TableName extends ConfectDataModel.TableNames<ConfectDataModel>,
> = ConfectTableInfo.ConfectTableInfo.ConfectDocument<
  ConfectDataModel.ConfectTableInfoWithName<ConfectDataModel, TableName>
>;

export type GenericConfectDataModel = Record<string, GenericConfectTableInfo>;

export type DataModelFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel & string]: TableInfoFromConfectTableInfo<
    ConfectDataModel[TableName]
  >;
};

export type TableNamesInConfectDataModel<
  ConfectDataModel extends ConfectDataModel.AnyWithProps,
> = keyof ConfectDataModel & string;

export type TableInfoFromConfectTableInfo<
  ConfectTableInfo extends GenericConfectTableInfo,
> = {
  document: ConfectTableInfo["convexDocument"];
  fieldPaths: ConfectTableInfo["fieldPaths"];
  indexes: ConfectTableInfo["indexes"];
  searchIndexes: ConfectTableInfo["searchIndexes"];
  vectorIndexes: ConfectTableInfo["vectorIndexes"];
};

export type GenericConfectTableInfo = {
  confectDocument: GenericConfectDoc<any, any>;
  encodedConfectDocument: GenericEncodedConfectDocument;
  convexDocument: GenericDocument;
  fieldPaths: GenericFieldPaths;
  indexes: GenericTableIndexes;
  searchIndexes: GenericTableSearchIndexes;
  vectorIndexes: GenericTableVectorIndexes;
};

export type TableSchemaFromConfectTableInfo<
  ConfectTableInfo extends GenericConfectTableInfo,
> = Schema.Schema<
  ConfectTableInfo["confectDocument"],
  ConfectTableInfo["encodedConfectDocument"]
>;

/**
 * The Confect document encoded for storage in Convex. This is the data as it is stored in the database.
 */
export type GenericConfectDoc<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDataModel[TableName]["encodedConfectDocument"];
