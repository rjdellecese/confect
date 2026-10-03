import type {
  Expand,
  GenericActionCtx,
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as DataModel from "./DataModel";

type ConvexVectorSearch<DataModel_ extends DataModel.AnyWithProps> =
  GenericActionCtx<DataModel.ToConvex<DataModel_>>["vectorSearch"];

/**
 * The service shape backing the `VectorSearch` tag. Named so declaration emit
 * references it instead of expanding the call signature at every usage.
 */
export interface VectorSearchService<
  DataModel_ extends DataModel.AnyWithProps,
> {
  <
    TableName extends DataModel.TableNames<DataModel_>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<DataModel.ToConvex<DataModel_>, TableName>,
        IndexName
      >
    >,
  ): Effect.Effect<Array<{ _id: GenericId<TableName>; _score: number }>>;
}

export type VectorSearchTag<DataModel_ extends DataModel.AnyWithProps> =
  Context.Service<
    VectorSearchService<DataModel_>,
    VectorSearchService<DataModel_>
  >;

export const make =
  <DataModel_ extends DataModel.AnyWithProps>(
    vectorSearch: ConvexVectorSearch<DataModel_>,
  ): VectorSearchService<DataModel_> =>
  (tableName, indexName, query) =>
    Effect.promise(() => vectorSearch(tableName, indexName, query));

export const VectorSearch = <
  DataModel_ extends DataModel.AnyWithProps,
>(): VectorSearchTag<DataModel_> =>
  Context.Service<VectorSearchService<DataModel_>>(
    "@confect/server/VectorSearch",
  );

export type VectorSearch<DataModel_ extends DataModel.AnyWithProps> =
  VectorSearchService<DataModel_>;

export const layer = <DataModel_ extends DataModel.AnyWithProps>(
  vectorSearch: ConvexVectorSearch<DataModel_>,
) => Layer.succeed(VectorSearch<DataModel_>(), make(vectorSearch));
