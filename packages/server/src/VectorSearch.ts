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
 * Callable service for finding similar vectors in an application table. Yield
 * the generated `VectorSearch` tag in an action or a schema-typed HTTP router
 * to obtain the search function.
 *
 * @remarks
 *   Codegen support: this interface names the generated service shape; do not
 *   import it directly. Yield `VectorSearch` from `confect/_generated/services`
 *   and call the resulting search function.
 *
 * @category Services
 */
export interface VectorSearchService<
  in out DataModel_ extends DataModel.AnyWithProps,
> {
  /**
   * Searches a vector index for nearest neighbors and returns their document
   * IDs and similarity scores.
   *
   * **Gotchas**
   *
   * The search does not return decoded documents. Fetch the documents in a
   * query if you need their fields.
   *
   * @category Searching
   *
   * @param tableName - Table containing the vector index.
   * @param indexName - Vector index defined on that table.
   * @param query - Search vector, optional result limit, and optional filter
   *   over the index's encoded field values.
   *
   * @returns An Effect producing ranked `{ _id, _score }` matches. A Convex
   *   rejection is a defect.
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
 * Annotates the generated `VectorSearch` tag. For an Effect requirement, import
 * the type `VectorSearch` from `confect/_generated/services` instead of naming
 * this tag type.
 *
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
 * Constructs the schema-specific tag for generated services. Import
 * `VectorSearch` from `confect/_generated/services` and yield it rather than
 * calling this factory.
 *
 * @internal
 */
export const VectorSearch = <
  DataModel_ extends DataModel.AnyWithProps,
>(): VectorSearchTag<DataModel_> =>
  Context.Service<VectorSearchService<DataModel_>>(
    "@confect/server/VectorSearch",
  );

/**
 * Callable vector search service specialized to the application's data model.
 * Its table names, index names, and filter fields come from that model.
 *
 * Yield `VectorSearch` from `confect/_generated/services` and call the returned
 * function to get ranked document IDs and scores.
 *
 * @category Services
 */
export type VectorSearch<DataModel_ extends DataModel.AnyWithProps> =
  VectorSearchService<DataModel_>;

/**
 * @internal
 */
export const layer = <DataModel_ extends DataModel.AnyWithProps>(
  vectorSearch: ConvexVectorSearch<DataModel_>,
) => Layer.succeed(VectorSearch<DataModel_>(), make(vectorSearch));
