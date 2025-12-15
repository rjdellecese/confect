import type {
  Expand,
  GenericDocument,
  IdField,
  SystemFields,
  SystemIndexes,
} from "convex/server";
import type { GenericValidator } from "convex/values";
import type { Schema, Types } from "effect";
import type * as ConfectTable from "./ConfectTable";

export declare const TypeId: "@rjdellecese/confect/ConfectTableInfo";
export type TypeId = typeof TypeId;

export type ConfectTableInfo<
  Table extends ConfectTable.ConfectTable.AnyWithProps,
> =
  Table extends ConfectTable.ConfectTable<
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
          // It's pretty hard to recursively make an arbitrary TS type readonly/mutable, so we capture both the readonly version of the `convexDocument` (which is the `encodedConfectDocument`) and the mutable version (`convexDocument`).
          confectDocument: ExtractConfectDocument<TableName, TableSchema>;
          encodedConfectDocument: ExtractEncodedConfectDocument<
            TableName,
            TableSchema
          >;
          convexDocument: ExtractDocument<TableName, TableValidator>;
          fieldPaths:
            | keyof IdField<TableName>
            | ExtractFieldPaths<TableValidator>;
          indexes: Types.Simplify<Indexes & SystemIndexes>;
          searchIndexes: SearchIndexes;
          vectorIndexes: VectorIndexes;
        }
      : never
    : never;

export declare namespace ConfectTableInfo {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export type AnyWithProps =
    ConfectTableInfo<ConfectTable.ConfectTable.AnyWithProps>;

  export type TableInfo<ConfectTableInfo_ extends AnyWithProps> = {
    document: ConfectTableInfo_["convexDocument"];
    fieldPaths: ConfectTableInfo_["fieldPaths"];
    indexes: ConfectTableInfo_["indexes"];
    searchIndexes: ConfectTableInfo_["searchIndexes"];
    vectorIndexes: ConfectTableInfo_["vectorIndexes"];
  };

  export type TableSchema<ConfectTableInfo_ extends AnyWithProps> =
    Schema.Schema<
      ConfectTableInfo_["confectDocument"],
      ConfectTableInfo_["encodedConfectDocument"]
    >;

  export type ConfectDocument<ConfectTableInfo_ extends AnyWithProps> =
    ConfectTableInfo_["confectDocument"];
}

type ExtractConfectDocument<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = Types.Simplify<
  Readonly<IdField<TableName>> & Readonly<SystemFields> & TableSchema["Type"]
>;

type ExtractEncodedConfectDocument<
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

type ExtractDocument<TableName extends string, T extends GenericValidator> =
  Expand<IdField<TableName> & SystemFields & T["type"]> extends GenericDocument
    ? Expand<IdField<TableName> & SystemFields & T["type"]>
    : "Oops";

// End of vendored types from convex-js, partially modified.
