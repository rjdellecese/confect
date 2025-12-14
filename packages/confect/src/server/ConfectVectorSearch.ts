import type {
  Expand,
  GenericActionCtx,
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { Context, Effect, Layer } from "effect";
import type * as ConfectDataModel from "./ConfectDataModel";
import type { TableNamesInConfectDataModel } from "./ConfectDataModel";

type VectorSearch<
  ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
> = GenericActionCtx<
  ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel_>
>["vectorSearch"];

const make =
  <ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps>(
    vectorSearch: VectorSearch<ConfectDataModel_>,
  ) =>
  <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel_>,
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
  ) =>
    Effect.promise(() => vectorSearch(tableName, indexName, query));

export const ConfectVectorSearch = Context.GenericTag<ReturnType<typeof make>>(
  "@rjdellecese/confect/ConfectVectorSearch",
);
export type ConfectVectorSearch = typeof ConfectVectorSearch.Identifier;

export const layer = <
  ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
>(
  vectorSearch: VectorSearch<ConfectDataModel_>,
) => Layer.succeed(ConfectVectorSearch, make(vectorSearch));
