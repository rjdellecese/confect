import { Table } from "./Table.js";
import { Document } from "./Document.js";
import { Schema, Types } from "effect";
import { Expand, GenericDocument, GenericFieldPaths, GenericTableIndexes, GenericTableSearchIndexes, GenericTableVectorIndexes, IdField, SystemFields, SystemIndexes } from "convex/server";
import { GenericValidator } from "convex/values";

//#region src/server/TableInfo.d.ts
declare namespace TableInfo_d_exports {
  export { TableInfo, TypeId };
}
declare const TypeId: "@rjdellecese/confect/server/TableInfo";
type TypeId = typeof TypeId;
type TableInfo<TableDef extends Table.AnyWithProps> = TableDef extends Table<infer TableName, infer TableSchema, infer TableValidator, infer Indexes, infer SearchIndexes, infer VectorIndexes> ? TableSchema extends Schema.Schema.AnyNoContext ? {
  readonly [TypeId]: TypeId;
  document: ExtractDocument_<TableName, TableSchema>;
  encodedDocument: ExtractEncodedDocument<TableName, TableSchema>;
  convexDocument: ExtractConvexDocument<TableName, TableValidator>;
  fieldPaths: keyof IdField<TableName> | ExtractFieldPaths<TableValidator>;
  indexes: Types.Simplify<Indexes & SystemIndexes>;
  searchIndexes: SearchIndexes;
  vectorIndexes: VectorIndexes;
} : never : never;
declare namespace TableInfo {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps extends Any {
    document: Document.Any;
    encodedDocument: Document.AnyEncoded;
    convexDocument: GenericDocument;
    fieldPaths: GenericFieldPaths;
    indexes: GenericTableIndexes;
    searchIndexes: GenericTableSearchIndexes;
    vectorIndexes: GenericTableVectorIndexes;
  }
  type TableInfo<TableInfo_ extends AnyWithProps> = {
    document: TableInfo_["convexDocument"];
    fieldPaths: TableInfo_["fieldPaths"];
    indexes: TableInfo_["indexes"];
    searchIndexes: TableInfo_["searchIndexes"];
    vectorIndexes: TableInfo_["vectorIndexes"];
  };
  type TableSchema<TableInfo_ extends AnyWithProps> = Schema.Schema<TableInfo_["document"], TableInfo_["encodedDocument"]>;
  type Document<TableInfo_ extends AnyWithProps> = TableInfo_["document"];
}
type ExtractDocument_<TableName$1 extends string, TableSchema$1 extends Schema.Schema.AnyNoContext> = Types.Simplify<Readonly<IdField<TableName$1>> & Readonly<SystemFields> & TableSchema$1["Type"]>;
type ExtractEncodedDocument<TableName$1 extends string, TableSchema$1 extends Schema.Schema.AnyNoContext> = Types.Simplify<Readonly<IdField<TableName$1>> & Readonly<SystemFields> & TableSchema$1["Encoded"]>;
type ExtractFieldPaths<T extends GenericValidator> = T["fieldPaths"] | keyof SystemFields;
type ExtractConvexDocument<TableName$1 extends string, T extends GenericValidator> = Expand<IdField<TableName$1> & SystemFields & T["type"]> extends GenericDocument ? Expand<IdField<TableName$1> & SystemFields & T["type"]> : "Oops";
//#endregion
export { TableInfo, TableInfo_d_exports, TypeId };
//# sourceMappingURL=TableInfo.d.ts.map