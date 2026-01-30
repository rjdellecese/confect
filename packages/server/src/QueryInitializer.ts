import type {
  OrderedQuery as ConvexOrderedQuery,
  QueryInitializer as ConvexQueryInitializer,
  DocumentByInfo,
  GenericTableIndexes,
  GenericTableInfo,
  Indexes,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  NamedTableInfo,
  Query,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Array, Effect, Either, pipe, Schema } from "effect";
import type {
  BaseDatabaseReader,
  IndexFieldTypesForEq,
} from "@confect/core/Types";
import type * as DataModel from "./DataModel";
import * as Document from "./Document";
import * as OrderedQuery from "./OrderedQuery";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";

type QueryInitializer<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  _ConvexTableInfo extends GenericTableInfo,
  _TableInfo extends TableInfo.AnyWithProps,
> = {
  readonly get: {
    (
      id: GenericId<TableName>,
    ): Effect.Effect<
      _TableInfo["document"],
      Document.DocumentDecodeError | GetByIdFailure
    >;
    <IndexName extends keyof Indexes<_ConvexTableInfo>>(
      indexName: IndexName,
      ...indexFieldValues: IndexFieldTypesForEq<
        DataModel.ToConvex<DataModel_>,
        TableName,
        Indexes<_ConvexTableInfo>[IndexName]
      >
    ): Effect.Effect<
      _TableInfo["document"],
      Document.DocumentDecodeError | GetByIndexFailure
    >;
  };
  readonly index: {
    <IndexName extends keyof Indexes<_ConvexTableInfo>>(
      indexName: IndexName,
      indexRange?: (
        q: IndexRangeBuilder<
          _TableInfo["convexDocument"],
          NamedIndex<_ConvexTableInfo, IndexName>
        >,
      ) => IndexRange,
      order?: "asc" | "desc",
    ): OrderedQuery.OrderedQuery<_TableInfo, TableName>;
    <IndexName extends keyof Indexes<_ConvexTableInfo>>(
      indexName: IndexName,
      order?: "asc" | "desc",
    ): OrderedQuery.OrderedQuery<_TableInfo, TableName>;
  };
  readonly search: <IndexName extends keyof SearchIndexes<_ConvexTableInfo>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<_ConvexTableInfo>,
        NamedSearchIndex<_ConvexTableInfo, IndexName>
      >,
    ) => SearchFilter,
  ) => OrderedQuery.OrderedQuery<_TableInfo, TableName>;
};

export const make = <
  Tables extends Table.AnyWithProps,
  TableName extends Table.Name<Tables>,
>(
  tableName: TableName,
  convexDatabaseReader: BaseDatabaseReader<
    DataModel.ToConvex<DataModel.FromTables<Tables>>
  >,
  table: Table.WithName<Tables, TableName>,
): QueryInitializer<
  DataModel.DataModel<Tables>,
  TableName,
  DataModel.TableInfoWithName<DataModel.DataModel<Tables>, TableName>,
  DataModel.TableInfoWithName_<DataModel.DataModel<Tables>, TableName>
> => {
  type DataModel_ = DataModel.DataModel<Tables>;
  type ConvexDataModel_ = DataModel.ToConvex<DataModel_>;
  type ThisQueryInitializer = QueryInitializer<
    DataModel_,
    TableName,
    DataModel.TableInfoWithName<DataModel_, TableName>,
    DataModel.TableInfoWithName_<DataModel_, TableName>
  >;
  type QueryInitializerFunction<
    FunctionName extends keyof ThisQueryInitializer,
  > = ThisQueryInitializer[FunctionName];

  const getByIndex = <
    IndexName extends keyof Indexes<
      DataModel.TableInfoWithName<DataModel_, TableName>
    >,
  >(
    indexName: IndexName,
    indexFieldValues: IndexFieldTypesForEq<
      DataModel.ToConvex<DataModel_>,
      TableName,
      Indexes<DataModel.TableInfoWithName<DataModel_, TableName>>[IndexName]
    >,
  ): Effect.Effect<
    DataModel.DocumentWithName<DataModel_, TableName>,
    Document.DocumentDecodeError | GetByIndexFailure
  > => {
    const indexFields: GenericTableIndexes[keyof GenericTableIndexes] = (
      table.indexes as GenericTableIndexes
    )[indexName as keyof GenericTableIndexes]!;

    return pipe(
      Effect.promise(() =>
        convexDatabaseReader
          .query(tableName)
          .withIndex(indexName, (q) =>
            Array.reduce(
              indexFieldValues,
              q,
              (q_, v, i) => q_.eq(indexFields[i] as any, v as any) as any,
            ),
          )
          .unique(),
      ),
      Effect.andThen(
        Either.fromNullable(
          () =>
            new GetByIndexFailure({
              tableName,
              indexName: indexName as string,
              indexFieldValues: indexFieldValues as string[],
            }),
        ),
      ),
      Effect.andThen(Document.decode(tableName, table.Fields)),
    );
  };

  const get: QueryInitializerFunction<"get"> = ((
    ...args: Parameters<QueryInitializerFunction<"get">>
  ) => {
    if (args.length === 1) {
      const id = args[0] as GenericId<TableName>;

      return getById(tableName, convexDatabaseReader, table)(id);
    } else {
      const [indexName, ...indexFieldValues] = args;

      return getByIndex(
        indexName as keyof Indexes<
          DataModel.TableInfoWithName<DataModel_, TableName>
        >,
        indexFieldValues,
      );
    }
  }) as QueryInitializerFunction<"get">;

  const index: QueryInitializerFunction<"index"> = <
    IndexName extends keyof Indexes<
      DataModel.TableInfoWithName<DataModel_, TableName>
    >,
  >(
    indexName: IndexName,
    indexRangeOrOrder?:
      | ((
          q: IndexRangeBuilder<
            DataModel.TableInfoWithName_<
              DataModel_,
              TableName
            >["convexDocument"],
            NamedIndex<
              DataModel.TableInfoWithName<DataModel_, TableName>,
              IndexName
            >
          >,
        ) => IndexRange)
      | "asc"
      | "desc",
    order?: "asc" | "desc",
  ) => {
    const {
      applyWithIndex,
      applyOrder,
    }: {
      applyWithIndex: (
        queryInitializer: ConvexQueryInitializer<
          NamedTableInfo<ConvexDataModel_, TableName>
        >,
      ) => Query<NamedTableInfo<ConvexDataModel_, TableName>>;
      applyOrder: (
        query: Query<NamedTableInfo<ConvexDataModel_, TableName>>,
      ) => ConvexOrderedQuery<NamedTableInfo<ConvexDataModel_, TableName>>;
    } =
      indexRangeOrOrder === undefined
        ? {
            applyWithIndex: (q) => q.withIndex(indexName),
            applyOrder: (q) => q.order("asc"),
          }
        : typeof indexRangeOrOrder === "function"
          ? order === undefined
            ? {
                applyWithIndex: (q) =>
                  q.withIndex(indexName, indexRangeOrOrder),
                applyOrder: (q) => q.order("asc"),
              }
            : {
                applyWithIndex: (q) =>
                  q.withIndex(indexName, indexRangeOrOrder),
                applyOrder: (q) => q.order(order),
              }
          : {
              applyWithIndex: (q) => q.withIndex(indexName),
              applyOrder: (q) => q.order(indexRangeOrOrder),
            };

    const orderedQuery = pipe(
      convexDatabaseReader.query(tableName),
      applyWithIndex,
      applyOrder,
    );

    return OrderedQuery.make<
      DataModel.TableInfoWithName_<DataModel_, TableName>,
      TableName
    >(orderedQuery, tableName, table.Fields);
  };

  const search: QueryInitializerFunction<"search"> = (
    indexName,
    searchFilter,
  ) =>
    OrderedQuery.make<
      DataModel.TableInfoWithName_<DataModel_, TableName>,
      TableName
    >(
      convexDatabaseReader
        .query(tableName)
        .withSearchIndex(indexName, searchFilter),
      tableName,
      table.Fields,
    );

  return {
    get,
    index,
    search,
  };
};

export const getById =
  <Tables extends Table.AnyWithProps, TableName extends Table.Name<Tables>>(
    tableName: TableName,
    convexDatabaseReader: BaseDatabaseReader<
      DataModel.ToConvex<DataModel.FromTables<Tables>>
    >,
    table: Table.WithName<Tables, TableName>,
  ) =>
  (id: GenericId<TableName>) =>
    pipe(
      Effect.promise(() => convexDatabaseReader.get(id)),
      Effect.andThen(
        Either.fromNullable(() => new GetByIdFailure({ tableName, id })),
      ),
      Effect.andThen(Document.decode(tableName, table.Fields)),
    );

export class GetByIdFailure extends Schema.TaggedError<GetByIdFailure>(
  "GetByIdFailure",
)("GetByIdFailure", {
  id: Schema.String,
  tableName: Schema.String,
}) {
  override get message(): string {
    return Document.documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: "not found",
    });
  }
}

export class GetByIndexFailure extends Schema.TaggedError<GetByIndexFailure>(
  "GetByIndexFailure",
)("GetByIndexFailure", {
  tableName: Schema.String,
  indexName: Schema.String,
  indexFieldValues: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${this.indexFieldValues}'`;
  }
}
