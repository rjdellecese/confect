import { DataModel } from "./DataModel.js";
import { Context, Effect, Layer } from "effect";
import * as convex_server23 from "convex/server";
import { Expand, GenericActionCtx, NamedTableInfo, VectorIndexNames, VectorSearchQuery } from "convex/server";
import { GenericId } from "convex/values";

//#region src/server/VectorSearch.d.ts
declare namespace VectorSearch_d_exports {
  export { VectorSearch, layer, make };
}
type VectorSearch_<DataModel_ extends DataModel.AnyWithProps> = GenericActionCtx<DataModel.ToConvex<DataModel_>>["vectorSearch"];
declare const make: <DataModel_ extends DataModel.AnyWithProps>(vectorSearch: VectorSearch_<DataModel_>) => <TableName extends DataModel.TableNames<DataModel_>, IndexName extends VectorIndexNames<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>>(tableName: TableName, indexName: IndexName, query: Expand<VectorSearchQuery<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>, IndexName>>) => Effect.Effect<Array<{
  _id: GenericId<TableName>;
  _score: number;
}>>;
declare const VectorSearch: <DataModel_ extends DataModel.AnyWithProps>() => Context.Tag<(<TableName extends DataModel.TableNames<DataModel_>, IndexName extends keyof convex_server23.VectorIndexes<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>>(tableName: TableName, indexName: IndexName, query: {
  vector: number[];
  limit?: number | undefined;
  filter?: ((q: convex_server23.VectorFilterBuilder<convex_server23.DocumentByInfo<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>, convex_server23.NamedVectorIndex<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>, IndexName>>) => convex_server23.FilterExpression<boolean>) | undefined;
}) => Effect.Effect<{
  _id: GenericId<TableName>;
  _score: number;
}[], never, never>), <TableName extends DataModel.TableNames<DataModel_>, IndexName extends keyof convex_server23.VectorIndexes<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>>(tableName: TableName, indexName: IndexName, query: {
  vector: number[];
  limit?: number | undefined;
  filter?: ((q: convex_server23.VectorFilterBuilder<convex_server23.DocumentByInfo<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>, convex_server23.NamedVectorIndex<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>, IndexName>>) => convex_server23.FilterExpression<boolean>) | undefined;
}) => Effect.Effect<{
  _id: GenericId<TableName>;
  _score: number;
}[], never, never>>;
type VectorSearch<DataModel_ extends DataModel.AnyWithProps> = ReturnType<typeof VectorSearch<DataModel_>>["Identifier"];
declare const layer: <DataModel_ extends DataModel.AnyWithProps>(vectorSearch: VectorSearch_<DataModel_>) => Layer.Layer<(<TableName extends DataModel.TableNames<DataModel_>, IndexName extends keyof convex_server23.VectorIndexes<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>>(tableName: TableName, indexName: IndexName, query: {
  vector: number[];
  limit?: number | undefined;
  filter?: ((q: convex_server23.VectorFilterBuilder<convex_server23.DocumentByInfo<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>>, convex_server23.NamedVectorIndex<NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>, IndexName>>) => convex_server23.FilterExpression<boolean>) | undefined;
}) => Effect.Effect<{
  _id: GenericId<TableName>;
  _score: number;
}[], never, never>), never, never>;
//#endregion
export { VectorSearch, VectorSearch_d_exports, layer, make };
//# sourceMappingURL=VectorSearch.d.ts.map