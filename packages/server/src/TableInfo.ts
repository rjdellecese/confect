import type {
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
import type { WithSystemFields } from "@confect/core/SystemFields";
import type * as Document_ from "./Document";
import type * as Table from "./Table";

export declare const TypeId: "@confect/server/TableInfo";
export type TypeId = typeof TypeId;

export type TableInfo<Table_ extends Table.AnyWithProps> =
  Table_ extends Table.Table<
    infer TableName,
    infer TableSchema_,
    infer TableValidator,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes
  >
    ? {
        readonly [TypeId]: TypeId;
        readonly document: WithSystemFields<
          TableName,
          Schema.Schema.Type<TableSchema_>
        >;
        readonly encodedDocument: WithSystemFields<
          TableName,
          Schema.Codec.Encoded<TableSchema_>
        >;
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

export type TableSchema<TableInfo_ extends AnyWithProps> = Schema.Codec<
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
  WithSystemFields<TableName, T["type"]> extends GenericDocument
    ? WithSystemFields<TableName, T["type"]>
    : never;

// End of vendored types from convex-js, partially modified.
