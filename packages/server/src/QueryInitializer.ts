import type {
  OrderedQuery as ConvexOrderedQuery,
  QueryInitializer as ConvexQueryInitializer,
  DocumentByInfo,
  GenericTableIndexes,
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
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import type { ReadonlyRecord } from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type {
  BaseDatabaseReader,
  IndexFieldTypesForEq,
} from "@confect/core/Types";
import type * as DataModel from "./DataModel";
import * as Document from "./Document";
import * as OrderedQuery from "./OrderedQuery";
import * as QueryStream from "./QueryStream";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";

type ConvexTableInfoFor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
> = DataModel.TableInfoWithName<DataModel_, TableName>;

type TableInfoFor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
> = DataModel.TableInfoWithName_<DataModel_, TableName>;

export interface QueryInitializer<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DataModel.DocumentWithName<DataModel_, TableName>,
> {
  readonly get: {
    (
      id: GenericId<TableName>,
    ): Effect.Effect<Doc, Document.DocumentDecodeError | GetByIdFailure>;
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      >,
    >(
      indexName: IndexName,
      ...indexFieldValues: IndexFieldTypesForEq<
        DataModel.ToConvex<DataModel_>,
        TableName,
        Indexes<ConvexTableInfoFor<DataModel_, TableName>>[IndexName]
      >
    ): Effect.Effect<Doc, Document.DocumentDecodeError | GetByIndexFailure>;
  };
  readonly index: {
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      >,
    >(
      indexName: IndexName,
      indexRange?: (
        q: IndexRangeBuilder<
          TableInfoFor<DataModel_, TableName>["convexDocument"],
          NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>
        >,
      ) => IndexRange,
      order?: QueryStream.OrderDirection,
    ): OrderedQuery.OrderedQuery<TableInfoFor<DataModel_, TableName>, Doc>;
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      >,
    >(
      indexName: IndexName,
      order?: QueryStream.OrderDirection,
    ): OrderedQuery.OrderedQuery<TableInfoFor<DataModel_, TableName>, Doc>;
  };
  readonly search: <
    IndexName extends keyof SearchIndexes<
      ConvexTableInfoFor<DataModel_, TableName>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<ConvexTableInfoFor<DataModel_, TableName>>,
        NamedSearchIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>
      >,
    ) => SearchFilter,
  ) => OrderedQuery.OrderedQuery<TableInfoFor<DataModel_, TableName>, Doc>;
  /**
   * EXPERIMENTAL — stream-first querying (see `notes/stream-based-querying.md`).
   *
   * Like `index`, but returns a {@link QueryStream.QueryStream}: a genuine
   * Effect `Stream` of documents in index order that stays mergeable and
   * paginable.
   *
   * In SQL terms: an index range scan — `SELECT * FROM table WHERE <range>
   * ORDER BY <index fields> [DESC]`; `eq` calls are the equality
   * predicates, the bound calls are the range predicates. The value is a
   * reusable description of a query: each run re-runs the index query.   *
   * The typed range builder consumes `eq`-pinned fields from the index's
   * field tuple at the type level, so the stream's order-key type is
   * exactly the fields that still vary (the `ORDER BY` columns left after
   * the equality predicates). The order direction is part of the
   * type too: omitted, it is `"asc"`; a literal is tracked as that literal,
   * and a value known only at runtime as the union. The order parameter is
   * either absent or a direction — never `undefined` — so the type can't
   * claim a literal the runtime default would contradict.
   */
  readonly stream: {
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      > &
        string,
      Spec extends QueryStream.AnyIndexRangeSpec,
    >(
      indexName: IndexName,
      indexRange: (
        q: QueryStream.RangeBuilder<
          TableInfoFor<DataModel_, TableName>["convexDocument"],
          NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>
        >,
      ) => Spec,
    ): QueryStream.QueryStream<
      Doc,
      QueryStream.Remaining<Spec>,
      Document.DocumentDecodeError,
      never,
      "asc"
    >;
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      > &
        string,
      Spec extends QueryStream.AnyIndexRangeSpec,
      Direction extends QueryStream.OrderDirection,
    >(
      indexName: IndexName,
      indexRange: (
        q: QueryStream.RangeBuilder<
          TableInfoFor<DataModel_, TableName>["convexDocument"],
          NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>
        >,
      ) => Spec,
      order: Direction,
    ): QueryStream.QueryStream<
      Doc,
      QueryStream.Remaining<Spec>,
      Document.DocumentDecodeError,
      never,
      Direction
    >;
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      > &
        string,
    >(
      indexName: IndexName,
    ): QueryStream.QueryStream<
      Doc,
      NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>,
      Document.DocumentDecodeError,
      never,
      "asc"
    >;
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      > &
        string,
      Direction extends QueryStream.OrderDirection,
    >(
      indexName: IndexName,
      order: Direction,
    ): QueryStream.QueryStream<
      Doc,
      NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>,
      Document.DocumentDecodeError,
      never,
      Direction
    >;
  };
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
): QueryInitializer<DataModel.DataModel<Tables>, TableName> => {
  type DataModel_ = DataModel.DataModel<Tables>;
  type ConvexDataModel_ = DataModel.ToConvex<DataModel_>;
  type ThisQueryInitializer = QueryInitializer<DataModel_, TableName>;
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
      Effect.andThen((value) =>
        Effect.fromResult(
          Result.fromNullishOr(
            value,
            () =>
              new GetByIndexFailure({
                tableName,
                indexName: indexName as string,
                indexFieldValues,
              }),
          ),
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
      | QueryStream.OrderDirection,
    order?: QueryStream.OrderDirection,
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

  const stream: QueryInitializerFunction<"stream"> = ((
    indexName: string,
    indexRangeOrOrder?:
      | ((
          q: QueryStream.RangeBuilder<any, any>,
        ) => QueryStream.AnyIndexRangeSpec)
      | QueryStream.OrderDirection,
    maybeOrder?: QueryStream.OrderDirection,
  ) => {
    const order = Predicate.isString(indexRangeOrOrder)
      ? indexRangeOrOrder
      : (maybeOrder ?? "asc");

    // With no range callback, the leaf gets an empty spec (no ops, no
    // pinned fields).
    const spec = Predicate.isFunction(indexRangeOrOrder)
      ? indexRangeOrOrder(QueryStream.rangeBuilder())
      : QueryStream.rangeBuilder();

    // The type-level field tuple appends the `_creationTime` tiebreaker, but
    // the runtime `table.indexes` record stores only the declared fields —
    // append it here.
    const indexFields: ReadonlyArray<string> =
      indexName === "by_id"
        ? ["_id"]
        : indexName === "by_creation_time"
          ? ["_creationTime"]
          : pipe(
              Option.fromUndefinedOr(
                (
                  table.indexes as ReadonlyRecord<string, ReadonlyArray<string>>
                )[indexName],
              ),
              // An unknown index name is a defect, not an empty field list:
              // silently empty fields would make key extraction and range
              // splitting target the wrong fields.
              Option.getOrThrowWith(
                () =>
                  new Error(
                    `QueryInitializer.stream: table "${tableName}" has no index named "${indexName}"`,
                  ),
              ),
              Array.append("_creationTime"),
            );

    return QueryStream.fromReflection({
      reader: convexDatabaseReader as QueryStream.ReflectionReader,
      tableName,
      tableSchema: table.Fields,
      indexName,
      indexFields,
      spec,
      order,
    });
  }) as QueryInitializerFunction<"stream">;

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
    stream,
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
      Effect.andThen((value) =>
        Effect.fromResult(
          Result.fromNullishOr(
            value,
            () => new GetByIdFailure({ tableName, id }),
          ),
        ),
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
