import type {
  Expand,
  GenericActionCtx,
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, Layer } from "effect";
import type * as DataModel from "./DataModel";

type VectorSearch_<DataModel_ extends DataModel.DataModel.AnyWithProps> =
  GenericActionCtx<DataModel.DataModel.ToConvex<DataModel_>>["vectorSearch"];

export const make =
  <DataModel_ extends DataModel.DataModel.AnyWithProps>(
    vectorSearch: VectorSearch_<DataModel_>,
  ) =>
  <
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModel.DataModel.ToConvex<DataModel_>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<DataModel.DataModel.ToConvex<DataModel_>, TableName>,
        IndexName
      >
    >,
  ): Effect.Effect<Array<{ _id: GenericId<TableName>; _score: number }>> =>
    Effect.promise(() => vectorSearch(tableName, indexName, query));

export const VectorSearch = <
  DataModel_ extends DataModel.DataModel.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<DataModel_>>>(
    "@rjdellecese/confect/server/VectorSearch",
  );

export type VectorSearch<DataModel_ extends DataModel.DataModel.AnyWithProps> =
  ReturnType<typeof VectorSearch<DataModel_>>["Identifier"];

export const layer = <DataModel_ extends DataModel.DataModel.AnyWithProps>(
  vectorSearch: VectorSearch_<DataModel_>,
) => Layer.succeed(VectorSearch<DataModel_>(), make(vectorSearch));
