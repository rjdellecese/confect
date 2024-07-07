import { ParseResult, Schema } from "@effect/schema";
import {
  DocumentByInfo,
  Expression,
  FilterBuilder,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  Indexes,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  OrderedQuery,
  PaginationOptions,
  PaginationResult,
  Query,
  QueryInitializer,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";
import { Chunk, Effect, identity, Option, pipe, Record, Stream } from "effect";
import { ReadonlyDeep } from "type-fest";

import {
  ConfectDocumentByName,
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  GenericConfectTableInfo,
  TableInfoFromConfectTableInfo,
  TableNamesInConfectDataModel,
} from "~/src/data-model";
import {
  ConfectDataModelFromConfectSchema,
  GenericConfectSchema,
} from "~/src/schema";

interface ConfectQuery<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> {
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromConfectTableInfo<ConfectTableInfo>>
    ) => Expression<boolean>
  ): ConfectQuery<ConfectTableInfo, TableName>;
  order(
    order: "asc" | "desc"
  ): ConfectOrderedQuery<ConfectTableInfo, TableName>;
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<PaginationResult<ConfectTableInfo["confectDocument"]>>;
  collect(): Effect.Effect<ConfectTableInfo["confectDocument"][]>;
  take(n: number): Effect.Effect<ConfectTableInfo["confectDocument"][]>;
  first(): Effect.Effect<Option.Option<ConfectTableInfo["confectDocument"]>>;
  unique(): Effect.Effect<
    Option.Option<ConfectTableInfo["confectDocument"]>,
    NotUniqueError
  >;
  stream(): Stream.Stream<ConfectTableInfo["confectDocument"]>;
}

interface ConfectOrderedQuery<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> extends Omit<ConfectQuery<ConfectTableInfo, TableName>, "order"> {}

class NotUniqueError {
  readonly _tag = "NotUniqueError";
}

class ConfectQueryImpl<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> implements ConfectQuery<ConfectTableInfo, TableName>
{
  q: Query<TableInfoFromConfectTableInfo<ConfectTableInfo>>;
  tableSchema: Schema.Schema<
    ConfectTableInfo["confectDocument"],
    ReadonlyDeep<ConfectTableInfo["convexDocument"]>
  >;
  tableName: TableName;
  constructor(
    q:
      | Query<TableInfoFromConfectTableInfo<ConfectTableInfo>>
      | OrderedQuery<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
    tableSchema: Schema.Schema<
      ConfectTableInfo["confectDocument"],
      ReadonlyDeep<ConfectTableInfo["convexDocument"]>
    >,
    tableName: TableName
  ) {
    this.q = q as Query<TableInfoFromConfectTableInfo<ConfectTableInfo>>;
    this.tableSchema = tableSchema;
    this.tableName = tableName;
  }
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromConfectTableInfo<ConfectTableInfo>>
    ) => Expression<boolean>
  ): this {
    return new ConfectQueryImpl(
      this.q.filter(predicate),
      this.tableSchema,
      this.tableName
    ) as this;
  }
  order(order: "asc" | "desc"): ConfectQueryImpl<ConfectTableInfo, TableName> {
    return new ConfectQueryImpl(
      this.q.order(order),
      this.tableSchema,
      this.tableName
    );
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<PaginationResult<ConfectTableInfo["confectDocument"]>> {
    return pipe(
      Effect.Do,
      Effect.bind("paginationResult", () =>
        Effect.promise(() => this.q.paginate(paginationOpts))
      ),
      Effect.bind(
        "parsedPage",
        ({ paginationResult }) =>
          pipe(
            paginationResult.page,
            Effect.forEach((document) =>
              Schema.decode(this.tableSchema)(
                document as ReadonlyDeep<ConfectTableInfo["convexDocument"]>
              )
            )
          ) as unknown as Effect.Effect<
            ConfectTableInfo["confectDocument"][],
            ParseResult.ParseIssue,
            never
          >
      ),
      Effect.map(({ paginationResult, parsedPage }) => ({
        page: parsedPage,
        isDone: paginationResult.isDone,
        continueCursor: paginationResult.continueCursor,
        splitCursor: paginationResult.splitCursor,
        pageStatus: paginationResult.pageStatus,
      })),
      Effect.orDie
    );
  }
  collect(): Effect.Effect<ConfectTableInfo["confectDocument"][]> {
    return pipe(
      Effect.promise(() => this.q.collect()),
      Effect.flatMap(
        Effect.forEach((document) =>
          pipe(
            document as ReadonlyDeep<ConfectTableInfo["convexDocument"]>,
            Schema.decode(this.tableSchema)
          )
        )
      ),
      Effect.orDie
    );
  }
  take(n: number): Effect.Effect<ConfectTableInfo["confectDocument"][]> {
    return pipe(
      this.stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toArray(chunk))
    );
  }
  first(): Effect.Effect<Option.Option<ConfectTableInfo["confectDocument"]>> {
    return pipe(this.stream(), Stream.runHead);
  }
  unique(): Effect.Effect<
    Option.Option<ConfectTableInfo["confectDocument"]>,
    NotUniqueError
  > {
    return pipe(
      this.stream(),
      Stream.take(2),
      Stream.runCollect,
      Effect.flatMap((chunk) =>
        Chunk.get(chunk, 1)
          ? Effect.fail(new NotUniqueError())
          : Effect.succeed(Chunk.get(chunk, 0))
      )
    );
  }
  stream(): Stream.Stream<ConfectTableInfo["confectDocument"]> {
    return pipe(
      Stream.fromAsyncIterable(this.q, identity),
      Stream.mapEffect((document) =>
        Schema.decodeUnknown(this.tableSchema)(document)
      ),
      Stream.orDie
    );
  }
}

interface ConfectQueryInitializer<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> extends ConfectQuery<ConfectTableInfo, TableName> {
  fullTableScan(): ConfectQuery<ConfectTableInfo, TableName>;
  withIndex<
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectTableInfo>
    >,
  >(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
            NamedIndex<
              TableInfoFromConfectTableInfo<ConfectTableInfo>,
              IndexName
            >,
            0
          >
        ) => IndexRange)
      | undefined
  ): ConfectQuery<ConfectTableInfo, TableName>;
  withSearchIndex<
    IndexName extends keyof SearchIndexes<
      TableInfoFromConfectTableInfo<ConfectTableInfo>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
        NamedSearchIndex<
          TableInfoFromConfectTableInfo<ConfectTableInfo>,
          IndexName
        >
      >
    ) => SearchFilter
  ): ConfectOrderedQuery<ConfectTableInfo, TableName>;
}

class ConfectQueryInitializerImpl<
  ConfectTableInfo extends GenericConfectTableInfo,
  TableName extends string,
> implements ConfectQueryInitializer<ConfectTableInfo, TableName>
{
  q: QueryInitializer<TableInfoFromConfectTableInfo<ConfectTableInfo>>;
  tableSchema: Schema.Schema<
    ConfectTableInfo["confectDocument"],
    ReadonlyDeep<ConfectTableInfo["convexDocument"]>
  >;
  tableName: TableName;
  constructor(
    q: QueryInitializer<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
    tableSchema: Schema.Schema<
      ConfectTableInfo["confectDocument"],
      ReadonlyDeep<ConfectTableInfo["convexDocument"]>
    >,
    tableName: TableName
  ) {
    this.q = q;
    this.tableSchema = tableSchema;
    this.tableName = tableName;
  }
  fullTableScan(): ConfectQuery<ConfectTableInfo, TableName> {
    return new ConfectQueryImpl(
      this.q.fullTableScan(),
      this.tableSchema,
      this.tableName
    );
  }
  withIndex<
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<ConfectTableInfo>
    >,
  >(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfoFromConfectTableInfo<ConfectTableInfo>>,
            NamedIndex<
              TableInfoFromConfectTableInfo<ConfectTableInfo>,
              IndexName
            >,
            0
          >
        ) => IndexRange)
      | undefined
  ): ConfectQuery<ConfectTableInfo, TableName> {
    return new ConfectQueryImpl(
      this.q.withIndex(indexName, indexRange),
      this.tableSchema,
      this.tableName
    );
  }
  withSearchIndex<
    IndexName extends keyof SearchIndexes<
      TableInfoFromConfectTableInfo<ConfectTableInfo>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        ConfectTableInfo["confectDocument"],
        NamedSearchIndex<
          TableInfoFromConfectTableInfo<ConfectTableInfo>,
          IndexName
        >
      >
    ) => SearchFilter
  ): ConfectOrderedQuery<ConfectTableInfo, TableName> {
    return new ConfectQueryImpl(
      this.q.withSearchIndex(indexName, searchFilter),
      this.tableSchema,
      this.tableName
    );
  }
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromConfectTableInfo<ConfectTableInfo>>
    ) => Expression<boolean>
  ): this {
    return this.fullTableScan().filter(predicate) as this;
  }
  order(
    order: "asc" | "desc"
  ): ConfectOrderedQuery<ConfectTableInfo, TableName> {
    return this.fullTableScan().order(order);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<PaginationResult<ConfectTableInfo["confectDocument"]>> {
    return this.fullTableScan().paginate(paginationOpts);
  }
  collect(): Effect.Effect<ConfectTableInfo["confectDocument"][]> {
    return this.fullTableScan().collect();
  }
  take(n: number): Effect.Effect<ConfectTableInfo["confectDocument"][]> {
    return this.fullTableScan().take(n);
  }
  first(): Effect.Effect<Option.Option<ConfectTableInfo["confectDocument"]>> {
    return this.fullTableScan().first();
  }
  unique(): Effect.Effect<
    Option.Option<ConfectTableInfo["confectDocument"]>,
    NotUniqueError
  > {
    return this.fullTableScan().unique();
  }
  stream(): Stream.Stream<ConfectTableInfo["confectDocument"]> {
    return this.fullTableScan().stream();
  }
}

export type DatabaseSchemasFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel & string]: Schema.Schema<
    ConfectDataModel[TableName]["confectDocument"],
    ReadonlyDeep<ConfectDataModel[TableName]["convexDocument"]>
  >;
};

export interface ConfectDatabaseReader<
  ConfectDataModel extends GenericConfectDataModel,
> {
  query<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName
  ): ConfectQueryInitializer<ConfectDataModel[TableName], TableName>;
  get<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    Option.Option<ConfectDataModel[TableName]["confectDocument"]>
  >;
  normalizeId<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
}

export class ConfectDatabaseReaderImpl<
  ConfectDataModel extends GenericConfectDataModel,
> implements ConfectDatabaseReader<ConfectDataModel>
{
  db: GenericDatabaseReader<DataModelFromConfectDataModel<ConfectDataModel>>;
  databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
  constructor(
    db: GenericDatabaseReader<DataModelFromConfectDataModel<ConfectDataModel>>,
    databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>
  ) {
    this.db = db;
    this.databaseSchemas = databaseSchemas;
  }
  normalizeId<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  get<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    Option.Option<ConfectDataModel[TableName]["confectDocument"]>
  > {
    return pipe(
      Effect.promise(() => this.db.get(id)),
      Effect.map(Option.fromNullable)
    );
  }
  query<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName
  ): ConfectQueryInitializer<ConfectDataModel[TableName], TableName> {
    return new ConfectQueryInitializerImpl(
      this.db.query(tableName),
      this.databaseSchemas[tableName],
      tableName
    );
  }
}

export interface ConfectDatabaseWriter<
  ConfectDataModel extends GenericConfectDataModel,
> {
  query<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName
  ): ConfectQueryInitializer<ConfectDataModel[TableName], TableName>;
  get<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    Option.Option<ConfectDataModel[TableName]["confectDocument"]>
  >;
  normalizeId<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
  insert<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    table: TableName,
    value: WithoutSystemFields<
      ConfectDocumentByName<ConfectDataModel, TableName>
    >
  ): Effect.Effect<GenericId<TableName>>;
  patch<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>,
    value: Partial<ConfectDocumentByName<ConfectDataModel, TableName>>
  ): Effect.Effect<void>;
  replace<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<
      ConfectDocumentByName<ConfectDataModel, TableName>
    >
  ): Effect.Effect<void>;
  delete(id: GenericId<string>): Effect.Effect<void>;
}

export class EffectDatabaseWriterImpl<
  ConfectDataModel extends GenericConfectDataModel,
> implements ConfectDatabaseWriter<ConfectDataModel>
{
  databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
  db: GenericDatabaseWriter<DataModelFromConfectDataModel<ConfectDataModel>>;
  reader: ConfectDatabaseReader<ConfectDataModel>;
  constructor(
    db: GenericDatabaseWriter<DataModelFromConfectDataModel<ConfectDataModel>>,
    databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>
  ) {
    this.db = db;
    // TODO: Does this need to be an instance variable?
    this.databaseSchemas = databaseSchemas;
    this.reader = new ConfectDatabaseReaderImpl(db, databaseSchemas);
  }
  query<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName
  ): ConfectQueryInitializer<ConfectDataModel[TableName], TableName> {
    return this.reader.query(tableName);
  }
  get<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    Option.Option<ConfectDataModel[TableName]["confectDocument"]>
  > {
    return this.reader.get(id);
  }
  normalizeId<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  insert<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    table: TableName,
    value: WithoutSystemFields<
      ConfectDocumentByName<ConfectDataModel, TableName>
    >
  ): Effect.Effect<GenericId<TableName>> {
    return pipe(
      value,
      Schema.encode(this.databaseSchemas[table]),
      Effect.andThen((encodedValue) =>
        Effect.promise(() => this.db.insert(table, encodedValue))
      ),
      Effect.orDie
    );
  }
  patch<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>,
    value: Partial<ConfectDocumentByName<ConfectDataModel, TableName>>
  ): Effect.Effect<void> {
    return Effect.promise(() => this.db.patch(id, value));
  }
  replace<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<
      ConfectDocumentByName<ConfectDataModel, TableName>
    >
  ): Effect.Effect<void> {
    return Effect.promise(() => this.db.replace(id, value));
  }
  delete(id: GenericId<string>): Effect.Effect<void> {
    return Effect.promise(() => this.db.delete(id));
  }
}

export const schemasFromConfectSchema = <
  ConfectSchema extends GenericConfectSchema,
>(
  effectSchema: ConfectSchema
) =>
  Record.map(
    effectSchema,
    ({ tableSchema: schema }) => schema
  ) as DatabaseSchemasFromConfectDataModel<
    ConfectDataModelFromConfectSchema<ConfectSchema>
  >;
