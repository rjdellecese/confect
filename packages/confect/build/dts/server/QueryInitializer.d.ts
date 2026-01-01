import { BaseDatabaseReader, IndexFieldTypesForEq } from "../internal/typeUtils.js";
import { Table } from "./Table.js";
import { DataModel } from "./DataModel.js";
import { DocumentDecodeError } from "./Document.js";
import { TableInfo } from "./TableInfo.js";
import { OrderedQuery as OrderedQuery$1 } from "./OrderedQuery.js";
import { Effect, Schema } from "effect";
import { DocumentByInfo, GenericTableInfo, IndexRange, IndexRangeBuilder, Indexes, NamedIndex, NamedSearchIndex, SearchFilter, SearchFilterBuilder, SearchIndexes } from "convex/server";
import { GenericId } from "convex/values";

//#region src/server/QueryInitializer.d.ts
declare namespace QueryInitializer_d_exports {
  export { GetByIdFailure, GetByIndexFailure, getById, make };
}
type QueryInitializer<DataModel_ extends DataModel.AnyWithProps, TableName extends DataModel.TableNames<DataModel_>, _TableInfo extends GenericTableInfo, _TableInfo_ extends TableInfo.AnyWithProps> = {
  readonly get: {
    (id: GenericId<TableName>): Effect.Effect<_TableInfo_["document"], DocumentDecodeError | GetByIdFailure>;
    <IndexName extends keyof Indexes<_TableInfo>>(indexName: IndexName, ...indexFieldValues: IndexFieldTypesForEq<DataModel.ToConvex<DataModel_>, TableName, Indexes<_TableInfo>[IndexName]>): Effect.Effect<_TableInfo_["document"], DocumentDecodeError | GetByIndexFailure>;
  };
  readonly index: {
    <IndexName extends keyof Indexes<_TableInfo>>(indexName: IndexName, indexRange?: (q: IndexRangeBuilder<_TableInfo_["convexDocument"], NamedIndex<_TableInfo, IndexName>>) => IndexRange, order?: "asc" | "desc"): OrderedQuery$1<_TableInfo_, TableName>;
    <IndexName extends keyof Indexes<_TableInfo>>(indexName: IndexName, order?: "asc" | "desc"): OrderedQuery$1<_TableInfo_, TableName>;
  };
  readonly search: <IndexName extends keyof SearchIndexes<_TableInfo>>(indexName: IndexName, searchFilter: (q: SearchFilterBuilder<DocumentByInfo<_TableInfo>, NamedSearchIndex<_TableInfo, IndexName>>) => SearchFilter) => OrderedQuery$1<_TableInfo_, TableName>;
};
declare const make: <Tables extends Table.AnyWithProps, TableName extends Table.Name<Tables>>(tableName: TableName, convexDatabaseReader: BaseDatabaseReader<DataModel.ToConvex<DataModel.FromTables<Tables>>>, table: Table.WithName<Tables, TableName>) => QueryInitializer<DataModel<Tables>, TableName, DataModel.TableInfoWithName<DataModel<Tables>, TableName>, DataModel.TableInfoWithName_<DataModel<Tables>, TableName>>;
declare const getById: <Tables extends Table.AnyWithProps, TableName extends Table.Name<Tables>>(tableName: TableName, convexDatabaseReader: BaseDatabaseReader<DataModel.ToConvex<DataModel.FromTables<Tables>>>, table: Table.WithName<Tables, TableName>) => (id: GenericId<TableName>) => Effect.Effect<{
  [x: string]: any;
}, DocumentDecodeError | GetByIdFailure, never>;
declare const GetByIdFailure_base: Schema.TaggedErrorClass<GetByIdFailure, "GetByIdFailure", {
  readonly _tag: Schema.tag<"GetByIdFailure">;
} & {
  id: typeof Schema.String;
  tableName: typeof Schema.String;
}>;
declare class GetByIdFailure extends GetByIdFailure_base {
  get message(): string;
}
declare const GetByIndexFailure_base: Schema.TaggedErrorClass<GetByIndexFailure, "GetByIndexFailure", {
  readonly _tag: Schema.tag<"GetByIndexFailure">;
} & {
  tableName: typeof Schema.String;
  indexName: typeof Schema.String;
  indexFieldValues: Schema.Array$<typeof Schema.String>;
}>;
declare class GetByIndexFailure extends GetByIndexFailure_base {
  get message(): string;
}
//#endregion
export { GetByIdFailure, GetByIndexFailure, QueryInitializer_d_exports, getById, make };
//# sourceMappingURL=QueryInitializer.d.ts.map