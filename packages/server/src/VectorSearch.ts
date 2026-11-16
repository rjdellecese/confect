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
  GenericActionCtx<DataModel.ToConvexDataModel<DataModel_>>["vectorSearch"];

/**
 * The service shape backing the `VectorSearch` tag. Named so declaration emit
 * references it instead of expanding the call signature at every usage. Acquire
 * the generated tag in an action and call the resulting function.
 */
export interface VectorSearchService<
  in out DataModel_ extends DataModel.AnyWithProps,
> {
  /**
   * Query a vector index for nearest neighbors.
   *
   * @param tableName - Declared table containing the index.
   * @param indexName - Vector index defined on that table.
   * @param query - Convex vector-search options: vector, optional limit and
   *   index-filter callback. Filters use Convex's encoded field values.
   *
   * @returns An Effect producing ranked {_id, _score} matches, not decoded
   *   documents. Native failures are defects; use a query to fetch documents.
   */
  <
    TableName extends DataModel.TableNames<DataModel_>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModel.ToConvexDataModel<DataModel_>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<DataModel.ToConvexDataModel<DataModel_>, TableName>,
        IndexName
      >
    >,
  ): Effect.Effect<Array<{ _id: GenericId<TableName>; _score: number }>>;
}

/**
 * @internal
 */
export type VectorSearchTag<DataModel_ extends DataModel.AnyWithProps> =
  Context.Service<
    VectorSearchService<DataModel_>,
    VectorSearchService<DataModel_>
  >;

/**
 * @internal
 */
export const make =
  <DataModel_ extends DataModel.AnyWithProps>(
    vectorSearch: ConvexVectorSearch<DataModel_>,
  ): VectorSearchService<DataModel_> =>
  (tableName, indexName, query) =>
    Effect.promise(() => vectorSearch(tableName, indexName, query));

/**
 * @internal
 */
export const VectorSearch = <
  DataModel_ extends DataModel.AnyWithProps,
>(): VectorSearchTag<DataModel_> =>
  Context.Service<VectorSearchService<DataModel_>>(
    "@confect/server/VectorSearch",
  );

/**
 * Callable vector-search service shape specialized to the application's schema.
 */
export type VectorSearch<DataModel_ extends DataModel.AnyWithProps> =
  VectorSearchService<DataModel_>;

/**
 * @internal
 */
export const layer = <DataModel_ extends DataModel.AnyWithProps>(
  vectorSearch: ConvexVectorSearch<DataModel_>,
) => Layer.succeed(VectorSearch<DataModel_>(), make(vectorSearch));
