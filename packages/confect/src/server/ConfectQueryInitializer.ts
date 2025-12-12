import type {
  DocumentByInfo,
  GenericTableIndexes,
  GenericTableInfo,
  Indexes,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  NamedTableInfo,
  OrderedQuery,
  Query,
  QueryInitializer,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Array, Effect, Either, pipe, Schema } from "effect";
import type { BaseDatabaseReader, IndexFieldTypesForEq } from "../typeUtils";
import type * as ConfectDataModel from "./ConfectDataModel";
import type {
  TableInfoFromConfectTableInfo,
  TableNamesInConfectDataModel,
} from "./ConfectDataModel";
import * as ConfectDocument from "./ConfectDocument";
import * as ConfectOrderedQuery from "./ConfectOrderedQuery";
import type { DataModelFromConfectTables } from "./ConfectSchema";
import type * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";

type ConfectQueryInitializer<
  ConfectDataModel extends ConfectDataModel.ConfectDataModel.AnyWithProps,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
  _TableInfo extends
    GenericTableInfo = ConfectDataModel.ConfectDataModel.TableInfoWithName<
    ConfectDataModel,
    TableName
  >,
  _ConfectTableInfo extends
    ConfectTableInfo.ConfectTableInfo.AnyWithProps = ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
    ConfectDataModel,
    TableName
  >,
> = {
  readonly get: {
    (
      id: GenericId<TableName>,
    ): Effect.Effect<
      _ConfectTableInfo["confectDocument"],
      ConfectDocument.DocumentDecodeError | GetByIdFailure
    >;
    <IndexName extends keyof Indexes<_TableInfo>>(
      indexName: IndexName,
      ...indexFieldValues: IndexFieldTypesForEq<
        ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel>,
        TableName,
        Indexes<_TableInfo>[IndexName]
      >
    ): Effect.Effect<
      _ConfectTableInfo["confectDocument"],
      ConfectDocument.DocumentDecodeError | GetByIndexFailure
    >;
  };
  readonly index: {
    <IndexName extends keyof Indexes<_TableInfo>>(
      indexName: IndexName,
      indexRange?: (
        q: IndexRangeBuilder<
          _ConfectTableInfo["convexDocument"],
          NamedIndex<_TableInfo, IndexName>
        >,
      ) => IndexRange,
      order?: "asc" | "desc",
    ): ConfectOrderedQuery.ConfectOrderedQuery<_ConfectTableInfo, TableName>;
    <IndexName extends keyof Indexes<_TableInfo>>(
      indexName: IndexName,
      order?: "asc" | "desc",
    ): ConfectOrderedQuery.ConfectOrderedQuery<_ConfectTableInfo, TableName>;
  };
  readonly search: <IndexName extends keyof SearchIndexes<_TableInfo>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<_TableInfo>,
        NamedSearchIndex<_TableInfo, IndexName>
      >,
    ) => SearchFilter,
  ) => ConfectOrderedQuery.ConfectOrderedQuery<_ConfectTableInfo, TableName>;
};

export const make = <
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
  TableName extends ConfectTable.ConfectTable.Name<Tables>,
>(
  tableName: TableName,
  convexDatabaseReader: BaseDatabaseReader<DataModelFromConfectTables<Tables>>,
  confectTable: ConfectTable.ConfectTable.WithName<Tables, TableName>,
): ConfectQueryInitializer<
  ConfectDataModel.ConfectDataModel<Tables>,
  TableName
> => {
  type ConfectDataModel = ConfectDataModel.ConfectDataModel<Tables>;
  type ConvexDataModel = DataModelFromConfectTables<Tables>;
  type ThisConfectQueryInitializer = ConfectQueryInitializer<
    ConfectDataModel,
    TableName
  >;
  type ConfectQueryInitializerFunction<
    FunctionName extends keyof ThisConfectQueryInitializer,
  > = ThisConfectQueryInitializer[FunctionName];

  const getByIndex = <
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    indexFieldValues: IndexFieldTypesForEq<
      ConfectDataModel.ConfectDataModel.DataModel<ConfectDataModel>,
      TableName,
      Indexes<
        TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
      >[IndexName]
    >,
  ): Effect.Effect<
    ConfectDataModel[TableName]["confectDocument"],
    ConfectDocument.DocumentDecodeError | GetByIndexFailure
  > => {
    const indexFields: GenericTableIndexes[keyof GenericTableIndexes] = (
      confectTable.indexes as GenericTableIndexes
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
      Effect.andThen(ConfectDocument.decode(tableName, confectTable.Fields)),
    );
  };

  const get: ConfectQueryInitializerFunction<"get"> = ((
    ...args: Parameters<ConfectQueryInitializerFunction<"get">>
  ) => {
    if (args.length === 1) {
      const id = args[0] as GenericId<TableName>;

      return getById(tableName, convexDatabaseReader, confectTable)(id);
    } else {
      const [indexName, ...indexFieldValues] = args;

      return getByIndex(
        indexName as keyof Indexes<
          TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
        >,
        indexFieldValues,
      );
    }
  }) as ConfectQueryInitializerFunction<"get">;

  const index: ConfectQueryInitializerFunction<"index"> = <
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>
    >,
  >(
    indexName: IndexName,
    indexRangeOrOrder?:
      | ((
          q: IndexRangeBuilder<
            ConfectDataModel[TableName]["convexDocument"],
            NamedIndex<
              TableInfoFromConfectTableInfo<ConfectDataModel[TableName]>,
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
        queryInitializer: QueryInitializer<
          NamedTableInfo<ConvexDataModel, TableName>
        >,
      ) => Query<NamedTableInfo<ConvexDataModel, TableName>>;
      applyOrder: (
        query: Query<NamedTableInfo<ConvexDataModel, TableName>>,
      ) => OrderedQuery<NamedTableInfo<ConvexDataModel, TableName>>;
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

    return ConfectOrderedQuery.make<ConfectDataModel[TableName], TableName>(
      orderedQuery,
      tableName,
      confectTable.Fields,
    );
  };

  const search: ConfectQueryInitializerFunction<"search"> = (
    indexName,
    searchFilter,
  ) =>
    ConfectOrderedQuery.make<ConfectDataModel[TableName], TableName>(
      convexDatabaseReader
        .query(tableName)
        .withSearchIndex(indexName, searchFilter),
      tableName,
      confectTable.Fields,
    );

  return {
    get,
    index,
    search,
  };
};

export const getById =
  <
    Tables extends ConfectTable.ConfectTable.AnyWithProps,
    TableName extends ConfectTable.ConfectTable.Name<Tables>,
  >(
    tableName: TableName,
    convexDatabaseReader: BaseDatabaseReader<
      DataModelFromConfectTables<Tables>
    >,
    confectTable: ConfectTable.ConfectTable.WithName<Tables, TableName>,
  ) =>
  (id: GenericId<TableName>) =>
    pipe(
      Effect.promise(() => convexDatabaseReader.get(id)),
      Effect.andThen(
        Either.fromNullable(() => new GetByIdFailure({ tableName, id })),
      ),
      Effect.andThen(ConfectDocument.decode(tableName, confectTable.Fields)),
    );

export class GetByIdFailure extends Schema.TaggedError<GetByIdFailure>(
  "GetByIdFailure",
)("GetByIdFailure", {
  id: Schema.String,
  tableName: Schema.String,
}) {
  override get message(): string {
    return ConfectDocument.documentErrorMessage({
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
