import type {
  Expand,
  GenericActionCtx,
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Context, Effect, Layer } from "effect";
import type * as ConfectDataModel from "./ConfectDataModel";

type VectorSearch<
  ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
> = GenericActionCtx<
  ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>
>["vectorSearch"];

export const make =
  <ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps>(
    vectorSearch: VectorSearch<ConfectDataModel_>,
  ) =>
  <
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<
        ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>,
        TableName
      >
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<
          ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>,
          TableName
        >,
        IndexName
      >
    >,
  ): Effect.Effect<Array<{ _id: GenericId<TableName>; _score: number }>> =>
    Effect.promise(() => vectorSearch(tableName, indexName, query));

export const ConfectVectorSearch = <
  ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
>() =>
  Context.GenericTag<ReturnType<typeof make<ConfectDataModel_>>>(
    "@rjdellecese/confect/server/ConfectVectorSearch",
  );

export type ConfectVectorSearch<
  ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
> = ReturnType<typeof ConfectVectorSearch<ConfectDataModel_>>["Identifier"];

export const layer = <
  ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
>(
  vectorSearch: VectorSearch<ConfectDataModel_>,
) =>
  Layer.succeed(ConfectVectorSearch<ConfectDataModel_>(), make(vectorSearch));
