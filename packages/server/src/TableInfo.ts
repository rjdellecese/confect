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

export declare const TypeId: "@confect/server/TableInfo";
export type TypeId = typeof TypeId;

export type TableInfo<Table_ extends Table.AnyWithProps> =
  Table_ extends Table.Table<
    infer TableName,
    infer _TableSchema,
    infer TableValidator,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes
  >
    ? {
        readonly [TypeId]: TypeId;
        readonly document: Table_["Doc"]["Type"];
        readonly encodedDocument: Table_["Doc"]["Encoded"];
        readonly convexDocument: ExtractConvexDocument<
          TableName,
          TableValidator
        >;
        readonly fieldPaths:
          | keyof IdField<TableName>
          | ExtractFieldPaths<TableValidator>;
        readonly indexes: Types.Simplify<Indexes & SystemIndexes>;
        readonly searchIndexes: SearchIndexes;
        readonly vectorIndexes: VectorIndexes;
      }
    : never;

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Any {
  readonly document: Document_.Any;
  readonly encodedDocument: Document_.AnyEncoded;
  readonly convexDocument: GenericDocument;
  readonly fieldPaths: GenericFieldPaths;
  readonly indexes: GenericTableIndexes;
  readonly searchIndexes: GenericTableSearchIndexes;
  readonly vectorIndexes: GenericTableVectorIndexes;
}

export type ConvexTableInfo<TableInfo_ extends AnyWithProps> = {
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

export type Document<TableInfo_ extends AnyWithProps> = TableInfo_["document"];

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
    : never;

// End of vendored types from convex-js, partially modified.
