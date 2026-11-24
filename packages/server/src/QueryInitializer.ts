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
import { identity, pipe } from "effect/Function";
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
import type * as QueryStreamKeyLabels from "./QueryStreamKeyLabels";
import * as QueryStreamIndexRange from "./QueryStreamIndexRange";
import type { QueryStreamOrderDirection as OrderDirection } from "./QueryStreamOrderDirection";
import type * as Table from "./Table";
import type { FullIndexScan } from "./internal/FullIndexScan";

type ConvexTableInfoFor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
> = DataModel.TableInfoWithName<DataModel_, TableName>;

type TableInfoFor<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
> = DataModel.TableInfoWithName_<DataModel_, TableName>;

/**
 * Lookup and query builders for the table selected by `reader.table(handle)`.
 * Lookups return decoded documents; index and search callbacks compare the
 * stored field values.
 *
 * @category Models
 */
export interface QueryInitializer<
  DataModel_ extends DataModel.AnyWithProps,
  TableName extends DataModel.TableNames<DataModel_>,
  Doc = DataModel.DocumentWithName<DataModel_, TableName>,
> {
  /**
   * Reads one decoded document by ID or by its unique combination of index
   * field values. A missing document is a typed failure, not `None`.
   *
   * **Gotchas**
   *
   * A call with a single argument always looks up a document ID, even if the
   * argument is a built-in index name. Use `get(id)` for an ID and
   * `index("by_creation_time", range)` to query by creation time.
   *
   * @category Reading
   */
  readonly get: {
    /**
     * Reads the document with the supplied ID.
     *
     * @category Reading
     *
     * @param id - Document ID for the selected table in this database's scope.
     *
     * @returns An effect yielding the document, or failing with
     *   `GetByIdFailure` when absent or `DocumentDecodeError` when decoding
     *   fails.
     */
    (
      id: DataModel.Id<DataModel_, TableName>,
    ): Effect.Effect<Doc, Document.DocumentDecodeError | GetByIdFailure>;
    /**
     * Reads the unique document matching the supplied index values.
     *
     * @category Reading
     *
     * @param indexName - Standard index used for an exact lookup.
     * @param indexFieldValues - Positional stored values in index-field order.
     *
     * @returns An effect yielding the unique matching document, or failing with
     *   `GetByIndexFailure` when absent or `DocumentDecodeError` when decoding
     *   fails. More than one match is a native uniqueness defect.
     */
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      >,
    >(
      indexName: IndexName,
      ...indexFieldValues: IndexFieldTypesForEq<
        DataModel.ToConvexDataModel<DataModel_>,
        TableName,
        Indexes<ConvexTableInfoFor<DataModel_, TableName>>[IndexName]
      >
    ): Effect.Effect<Doc, Document.DocumentDecodeError | GetByIndexFailure>;
  };
  /**
   * Creates an ordered standard-index query without fetching documents. Use
   * `index(name)` to scan the whole index ascending or `index(name, "desc")` to
   * scan descending. Every table has `by_creation_time` and `by_id` indexes.
   *
   * @category Reading
   *
   * @see {@link QueryInitializer.stream} for queries that need ordered composition.
   */
  readonly index: {
    /**
     * Creates an ordered query over the index entries selected by a native
     * Convex range callback.
     *
     * @category Reading
     *
     * @param indexName - Standard index name.
     * @param indexRange - Optional native Convex range callback. Apply `eq` to
     *   successive index fields, then optional lower/upper bounds on the next
     *   field. Values use their stored representation, not decoded codec
     *   output.
     * @param order - `"asc"` by default, or `"desc"`.
     *
     * @returns An OrderedQuery exposing first, take, collect, stream, and
     *   paginate.
     */
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
      order?: OrderDirection,
    ): OrderedQuery.OrderedQuery<TableInfoFor<DataModel_, TableName>, Doc>;
  } & FullIndexScan<TableInfoFor<DataModel_, TableName>, Doc>["index"];
  /**
   * Creates a full-text search query ordered by descending relevance.
   *
   * @category Reading
   *
   * @param indexName - Search index declared on the table.
   * @param searchFilter - Native Convex callback: call `search(field, text)` on
   *   the configured search field, then `eq(field, value)` for equality filters
   *   permitted by the index. Values use the stored representation.
   *
   * @returns An OrderedQuery whose consumers decode the matching documents.
   */
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
   * Creates a reusable {@link QueryStream.QueryStream} over a standard index.
   * Each run reads and decodes documents in index order; constructing or
   * composing the stream does not read them.
   *
   * **When to use**
   *
   * Use to merge index ranges, join documents, or paginate the result after
   * filtering or mapping it.
   *
   * **Details**
   *
   * Apply `eq` to successive leading index fields. Each equality removes that
   * field from the stream's visible ordering labels. Finish with `gt` or `gte`,
   * `lt` or `lte`, or a lower then an upper bound on the same field; these
   * bounds keep the field in the key. The arguments are stored field values,
   * not decoded values. The type tracks the remaining labels and the order
   * (`"asc"` by default).
   *
   * @category Reading
   *
   * @param indexName - Standard index name, not a full-text search index.
   * @param indexRange - Optional typed range callback; omit it for the full
   *   index.
   * @param order - Optional direction, defaulting to `"asc"`. Without a range
   *   callback, supply the direction as the second argument.
   *
   * @returns A reusable QueryStream of decoded documents, with
   *   `DocumentDecodeError` in its error channel and no additional service
   *   requirements. Keep callback effects deterministic and read-only when
   *   composing.
   *
   * @experimental
   *
   * @see {@link QueryInitializer.index} for a native ordered query.
   */
  readonly stream: {
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      > &
        string,
      Range extends QueryStreamIndexRange.QueryStreamIndexRange,
    >(
      indexName: IndexName,
      indexRange: (
        q: QueryStreamIndexRange.Builder<
          TableInfoFor<DataModel_, TableName>["convexDocument"],
          NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>
        >,
      ) => Range,
    ): QueryStream.QueryStream<
      Doc,
      QueryStreamKeyLabels.QueryStreamKeyLabels<
        QueryStreamIndexRange.Remaining<Range>
      >,
      "asc",
      Document.DocumentDecodeError,
      never
    >;
    <
      IndexName extends keyof Indexes<
        ConvexTableInfoFor<DataModel_, TableName>
      > &
        string,
      Range extends QueryStreamIndexRange.QueryStreamIndexRange,
      Direction extends OrderDirection,
    >(
      indexName: IndexName,
      indexRange: (
        q: QueryStreamIndexRange.Builder<
          TableInfoFor<DataModel_, TableName>["convexDocument"],
          NamedIndex<ConvexTableInfoFor<DataModel_, TableName>, IndexName>
        >,
      ) => Range,
      order: Direction,
    ): QueryStream.QueryStream<
      Doc,
      QueryStreamKeyLabels.QueryStreamKeyLabels<
        QueryStreamIndexRange.Remaining<Range>
      >,
      Direction,
      Document.DocumentDecodeError,
      never
    >;
  } & FullIndexScan<TableInfoFor<DataModel_, TableName>, Doc>["stream"];
}

/**
 * @internal
 */
export const make = <
  Tables extends Table.AnyWithProps,
  TableName extends Table.Name<Tables>,
>(
  convexDatabaseReader: BaseDatabaseReader<
    DataModel.ToConvexDataModel<DataModel.FromTables<Tables>>
  >,
  table: Table.WithName<Tables, TableName>,
): QueryInitializer<DataModel.FromTables<Tables>, TableName> => {
  const tableName = table.tableName;
  type DataModel_ = DataModel.FromTables<Tables>;
  type ConvexDataModel_ = DataModel.ToConvexDataModel<DataModel_>;
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
      DataModel.ToConvexDataModel<DataModel_>,
      TableName,
      Indexes<DataModel.TableInfoWithName<DataModel_, TableName>>[IndexName]
    >,
  ): Effect.Effect<
    DataModel.DocumentWithName<DataModel_, TableName>,
    Document.DocumentDecodeError | GetByIndexFailure
  > => {
    const indexFieldPaths: GenericTableIndexes[keyof GenericTableIndexes] = (
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
              (q_, v, i) => q_.eq(indexFieldPaths[i] as any, v as any) as any,
            ),
          )
          .unique(),
      ),
      Effect.andThen((value) =>
        Effect.fromResult(
          Result.fromNullishOr(value, () =>
            GetByIndexFailure.make({
              tableName,
              indexName: indexName as string,
              indexFieldValues,
            }),
          ),
        ),
      ),
      Effect.andThen(Document.decode(table)),
    );
  };

  const get: QueryInitializerFunction<"get"> = ((
    ...args: Parameters<QueryInitializerFunction<"get">>
  ) => {
    if (args.length === 1) {
      const id = args[0] as GenericId<TableName>;

      return getById<Tables, TableName>(convexDatabaseReader, table)(id);
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
      | OrderDirection,
    order?: OrderDirection,
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

    return OrderedQuery.make(orderedQuery, table);
  };

  const stream: QueryInitializerFunction<"stream"> = ((
    indexName: string,
    indexRangeOrOrder?:
      | ((
          q: QueryStreamIndexRange.Builder<any, any>,
        ) => QueryStreamIndexRange.QueryStreamIndexRange)
      | OrderDirection,
    maybeOrder?: OrderDirection,
  ) => {
    const orderDirection = Predicate.isString(indexRangeOrOrder)
      ? indexRangeOrOrder
      : (maybeOrder ?? "asc");

    // Without a range callback, the leaf scans the entire index.
    const indexRange = Predicate.isFunction(indexRangeOrOrder)
      ? indexRangeOrOrder(QueryStreamIndexRange.builder())
      : QueryStreamIndexRange.builder();

    // The type-level field tuple appends the `_creationTime` tiebreaker, but
    // the runtime `table.indexes` record stores only the declared fields—append it here.
    const indexFieldPaths: ReadonlyArray<string> =
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
      table,
      indexName,
      indexFieldPaths,
      indexRange,
      orderDirection,
    });
  }) as QueryInitializerFunction<"stream">;

  const search: QueryInitializerFunction<"search"> = (
    indexName,
    searchFilter,
  ) =>
    OrderedQuery.make(
      convexDatabaseReader
        .query(tableName)
        .withSearchIndex(indexName, searchFilter),
      table,
    );

  return {
    get,
    index,
    search,
    stream,
  };
};

/**
 * @internal
 */
export const getById =
  <Tables extends Table.AnyWithProps, TableName extends Table.Name<Tables>>(
    convexDatabaseReader: BaseDatabaseReader<
      DataModel.ToConvexDataModel<DataModel.FromTables<Tables>>
    >,
    table: Table.WithName<Tables, TableName>,
  ) =>
  (id: GenericId<TableName>) =>
    pipe(
      Effect.promise(() => convexDatabaseReader.get(id)),
      Effect.andThen((value) =>
        Effect.fromResult(
          Result.fromNullishOr(value, () =>
            GetByIdFailure.make({ tableName: table.tableName, id }),
          ),
        ),
      ),
      Effect.andThen(Document.decode(table)),
    );

/**
 * Typed failure from `get(id)` or the initial read in `patch` when the selected
 * table contains no document with that ID. Validating the ID's format does not
 * establish that the document exists.
 *
 * @category Errors
 */
export class GetByIdFailure extends Schema.TaggedError<GetByIdFailure, {}>()(
  "GetByIdFailure",
  {
    /**
     * The requested document ID.
     *
     * @category Getters
     */
    id: Schema.String,
    /**
     * The selected table's name.
     *
     * @category Getters
     */
    tableName: Schema.String,
  },
) {
  /**
   * Returns a message identifying the table and missing document ID.
   *
   * @category Getters
   */
  override get message(): string {
    return Document.documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: "not found",
    });
  }
}

/**
 * Typed failure from `get(indexName, ...indexFieldValues)` when no document
 * matches the indexed values. If several documents match, the native uniqueness
 * check produces a defect instead.
 *
 * @category Errors
 */
export class GetByIndexFailure extends Schema.TaggedError<
  GetByIndexFailure,
  {}
>()("GetByIndexFailure", {
  /**
   * The selected table's name.
   *
   * @category Getters
   */
  tableName: Schema.String,
  /**
   * The standard index used for lookup.
   *
   * @category Getters
   */
  indexName: Schema.String,
  /**
   * Requested values in index-field order, before any document decoding.
   *
   * @category Getters
   */
  indexFieldValues: Schema.Array(Schema.Unknown),
}) {
  /**
   * Returns a message identifying the table, index, and values that had no
   * match.
   *
   * @category Getters
   */
  override get message(): string {
    const fieldValues = Result.getOrThrowWith(
      Schema.encodeResult(
        Schema.fromJsonString(Schema.Unknown, {
          replacer: (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
        }),
      )(this.indexFieldValues),
      identity,
    );
    return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${fieldValues}'`;
  }
}
