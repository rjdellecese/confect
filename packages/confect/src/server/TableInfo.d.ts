import type {
  Expand,
  GenericDocument,
  GenericFieldPaths,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IdField,
  SystemFields,
  SystemIndexes,
} from "convex/server";
import type { GenericValidator } from "convex/values";
import type { Schema, Types } from "effect";
import type * as Document_ from "./Document";
import type * as Table from "./Table";

export declare const TypeId: "@rjdellecese/confect/server/TableInfo";
export type TypeId = typeof TypeId;

export type TableInfo<TableDef extends Table.Table.AnyWithProps> =
  TableDef extends Table.Table<
    infer TableName,
    infer TableSchema,
    infer TableValidator,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes
  >
    ? TableSchema extends Schema.Schema.AnyNoContext
      ? {
          // TODO: Should all of these fields be readonly?
          readonly [TypeId]: TypeId;
          // It's pretty hard to recursively make an arbitrary TS type readonly/mutable, so we capture both the readonly version of the `convexDocument` (which is the `encodedDocument`) and the mutable version (`convexDocument`).
          document: ExtractDocument_<TableName, TableSchema>;
          encodedDocument: ExtractEncodedDocument<TableName, TableSchema>;
          convexDocument: ExtractConvexDocument<TableName, TableValidator>;
          fieldPaths:
            | keyof IdField<TableName>
            | ExtractFieldPaths<TableValidator>;
          indexes: Types.Simplify<Indexes & SystemIndexes>;
          searchIndexes: SearchIndexes;
          vectorIndexes: VectorIndexes;
        }
      : never
    : never;

export declare namespace TableInfo {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps extends Any {
    document: Document_.Document.Any;
    encodedDocument: Document_.Document.AnyEncoded;
    convexDocument: GenericDocument;
    fieldPaths: GenericFieldPaths;
    indexes: GenericTableIndexes;
    searchIndexes: GenericTableSearchIndexes;
    vectorIndexes: GenericTableVectorIndexes;
  }

  export type TableInfo<TableInfo_ extends AnyWithProps> = {
    document: TableInfo_["convexDocument"];
    fieldPaths: TableInfo_["fieldPaths"];
    indexes: TableInfo_["indexes"];
    searchIndexes: TableInfo_["searchIndexes"];
    vectorIndexes: TableInfo_["vectorIndexes"];
  };

  export type TableSchema<TableInfo_ extends AnyWithProps> = Schema.Schema<
    TableInfo_["document"],
    TableInfo_["encodedDocument"]
  >;

  export type Document<TableInfo_ extends AnyWithProps> =
    TableInfo_["document"];
}

type ExtractDocument_<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = Types.Simplify<
  Readonly<IdField<TableName>> & Readonly<SystemFields> & TableSchema["Type"]
>;

type ExtractEncodedDocument<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = Types.Simplify<
  Readonly<IdField<TableName>> & Readonly<SystemFields> & TableSchema["Encoded"]
>;

// Vendored types from convex-js, partially modified.
// See https://github.com/get-convex/convex-js/pull/14

type ExtractFieldPaths<T extends GenericValidator> =
  | T["fieldPaths"]
  | keyof SystemFields;

type ExtractConvexDocument<
  TableName extends string,
  T extends GenericValidator,
> =
  Expand<IdField<TableName> & SystemFields & T["type"]> extends GenericDocument
    ? Expand<IdField<TableName> & SystemFields & T["type"]>
    : "Oops";

// End of vendored types from convex-js, partially modified.
