import {
  Expand,
  GenericDocument,
  GenericFieldPaths,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IdField,
  SystemFields,
} from "convex/server";
import { ReadonlyRecord } from "effect/Record";
import { HasReadonlyKeys, HasWritableKeys } from "type-fest";

import { IsEntirelyReadonly, IsEntirelyWritable } from "~/src/type-utils";

export type WithIdField<
  Document extends GenericDocument | GenericConfectDocument,
  TableName extends string,
> =
  IsEntirelyReadonly<Document> extends true
    ? Expand<Readonly<IdField<TableName>> & Document>
    : IsEntirelyWritable<Document> extends true
      ? Expand<IdField<TableName> & Document>
      : never;

export type WithSystemFields<
  Document extends GenericDocument | GenericConfectDocument,
> =
  HasReadonlyKeys<Document> extends true
    ? HasWritableKeys<Document> extends false
      ? Expand<Readonly<SystemFields> & Document>
      : never
    : HasWritableKeys<Document> extends true
      ? Expand<SystemFields & Document>
      : never;

export type WithIdAndSystemFields<
  Document extends GenericDocument | GenericConfectDocument,
  TableName extends string,
> = WithIdField<WithSystemFields<Document>, TableName>;

export type GenericConfectDocument = ReadonlyRecord<string, any>;

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
