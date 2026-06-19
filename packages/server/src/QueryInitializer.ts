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
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import type {
  BaseDatabaseReader,
  IndexFieldTypesForEq,
} from "@confect/core/Types";
import type * as DataModel from "./DataModel";
import * as Document from "./Document";
import * as OrderedQuery from "./OrderedQuery";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";

export interface QueryInitializer<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  ConvexTableInfo_ extends GenericTableInfo,
  TableInfo_ extends TableInfo.AnyWithProps,
  // The decoded document type. Defaults to the schema-derived structural
  // document; the database reader substitutes a *named* doc interface from the
  // codegen registry so declaration emit prints the name instead of expanding
  // the row structure inline.
  Doc = TableInfo_["document"],
> {
  readonly get: {
    (
      id: GenericId<TableName>,
    ): Effect.Effect<Doc, Document.DocumentDecodeError | GetByIdFailure>;
    <IndexName extends keyof Indexes<ConvexTableInfo_>>(
      indexName: IndexName,
      ...indexFieldValues: IndexFieldTypesForEq<
        DataModel.ToConvex<DataModel_>,
        TableName,
        Indexes<ConvexTableInfo_>[IndexName]
      >
    ): Effect.Effect<Doc, Document.DocumentDecodeError | GetByIndexFailure>;
  };
  readonly index: {
    <IndexName extends keyof Indexes<ConvexTableInfo_>>(
      indexName: IndexName,
      indexRange?: (
        q: IndexRangeBuilder<
          TableInfo_["convexDocument"],
          NamedIndex<ConvexTableInfo_, IndexName>
        >,
      ) => IndexRange,
      order?: "asc" | "desc",
    ): OrderedQuery.OrderedQuery<TableInfo_, TableName, Doc>;
    <IndexName extends keyof Indexes<ConvexTableInfo_>>(
      indexName: IndexName,
      order?: "asc" | "desc",
    ): OrderedQuery.OrderedQuery<TableInfo_, TableName, Doc>;
  };
  readonly search: <IndexName extends keyof SearchIndexes<ConvexTableInfo_>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<ConvexTableInfo_>,
        NamedSearchIndex<ConvexTableInfo_, IndexName>
      >,
    ) => SearchFilter,
  ) => OrderedQuery.OrderedQuery<TableInfo_, TableName, Doc>;
}

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
              indexFieldValues,
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
    >(
      orderedQuery,
      tableName,
      table.Fields as TableInfo.TableSchema<
        DataModel.TableInfoWithName_<DataModel_, TableName>
      >,
    );
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
      table.Fields as TableInfo.TableSchema<
        DataModel.TableInfoWithName_<DataModel_, TableName>
      >,
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

export class GetByIdFailure extends Schema.TaggedError<GetByIdFailure>()(
  "GetByIdFailure",
  {
    id: Schema.String,
    tableName: Schema.String,
  },
) {
  override get message(): string {
    return Document.documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: "not found",
    });
  }
}

export class GetByIndexFailure extends Schema.TaggedError<GetByIndexFailure>()(
  "GetByIndexFailure",
  {
    tableName: Schema.String,
    indexName: Schema.String,
    indexFieldValues: Schema.Array(Schema.Unknown),
  },
) {
  override get message(): string {
    return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${JSON.stringify(
      this.indexFieldValues,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    )}'`;
  }
}
