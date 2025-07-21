import type {
  Expand,
  GenericActionCtx,
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { Effect, Layer } from "effect";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableNamesInConfectDataModel,
} from "./data-model";

type VectorSearch<ConfectDataModel extends GenericConfectDataModel> =
  GenericActionCtx<
    DataModelFromConfectDataModel<ConfectDataModel>
  >["vectorSearch"];

const make = <ConfectDataModel extends GenericConfectDataModel>(
  vectorSearch: VectorSearch<ConfectDataModel>,
) => ({
  vectorSearch: <
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
  ) => Effect.promise(() => vectorSearch(tableName, indexName, query)),
});

export class ConfectVectorSearch extends Effect.Tag(
  "@rjdellecese/confect/ConfectVectorSearch",
)<ConfectVectorSearch, ReturnType<typeof make>>() {
  static readonly layer = <ConfectDataModel extends GenericConfectDataModel>(
    vectorSearch: VectorSearch<ConfectDataModel>,
  ) => Layer.succeed(this, make(vectorSearch));
}
