import {
  GenericDocument,
  GenericFieldPaths,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  SystemFields,
} from "convex/server";
import { GenericId, Value } from "convex/values";

export type GenericDocumentWithSystemFields = GenericDocument & {
  _id: GenericId<string>;
} & { [Key in SystemFields & string]: any } & { [Key: string]: Value };

export type GenericConfectDocument = Record<string, any>;

export type GenericConfectDocumentWithSystemFields = {
  _id: GenericId<string>;
} & { [Key in SystemFields & string]: any } & { [Key: string]: any };

export type ConfectDocumentByName<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDataModel[TableName]["confectDocument"];

export type GenericConfectDataModel = Record<string, GenericConfectTableInfo>;

// TODO: Type-level test?
export type DataModelFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel & string]: TableInfoFromConfectTableInfo<
    ConfectDataModel[TableName]
  >;
};

export type TableNamesInConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = keyof ConfectDataModel & string;

// TODO: Type-level test?
export type TableInfoFromConfectTableInfo<
  ConfectTableInfo extends GenericConfectTableInfo,
> = {
  document: ConfectTableInfo["document"];
  fieldPaths: ConfectTableInfo["fieldPaths"];
  indexes: ConfectTableInfo["indexes"];
  searchIndexes: ConfectTableInfo["searchIndexes"];
  vectorIndexes: ConfectTableInfo["vectorIndexes"];
};

export type GenericConfectTableInfo = {
  document: GenericDocument;
  confectDocument: GenericConfectDocument;
  fieldPaths: GenericFieldPaths;
  indexes: GenericTableIndexes;
  searchIndexes: GenericTableSearchIndexes;
  vectorIndexes: GenericTableVectorIndexes;
};
