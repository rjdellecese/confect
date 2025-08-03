import type {
  Expand,
  GenericActionCtx,
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { Context, Effect, Layer } from "effect";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableNamesInConfectDataModel,
} from "./data_model";

type VectorSearch<ConfectDataModel extends GenericConfectDataModel> =
  GenericActionCtx<
    DataModelFromConfectDataModel<ConfectDataModel>
  >["vectorSearch"];

const make =
  <ConfectDataModel extends GenericConfectDataModel>(
    vectorSearch: VectorSearch<ConfectDataModel>,
  ) =>
  <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModelFromConfectDataModel<ConfectDataModel>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<
          DataModelFromConfectDataModel<ConfectDataModel>,
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

export const confectVectorSearchLayer = <
  ConfectDataModel extends GenericConfectDataModel,
>(
  vectorSearch: VectorSearch<ConfectDataModel>,
) => Layer.succeed(ConfectVectorSearch, make(vectorSearch));
