import { Schema } from "@effect/schema";
import {
  DocumentByInfo,
  DocumentByName,
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
  TableNamesInDataModel,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";
import { Chunk, Effect, identity, Option, pipe, Record, Stream } from "effect";

import { ConfectDocumentByName } from "~/src/data-model";
import {
  ConfectDataModelFromEffectSchema,
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  GenericConfectSchema,
  GenericConfectTableInfo,
  TableInfoFromConfectTableInfo,
  TableNamesInConfectDataModel,
} from "~/src/schema";

interface EffectQuery<EffectTableInfo extends GenericConfectTableInfo> {
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromConfectTableInfo<EffectTableInfo>>
    ) => Expression<boolean>
  ): EffectQuery<EffectTableInfo>;
  order(order: "asc" | "desc"): EffectOrderedQuery<EffectTableInfo>;
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<PaginationResult<EffectTableInfo["confectDocument"]>>;
  collect(): Effect.Effect<EffectTableInfo["confectDocument"][]>;
  take(n: number): Effect.Effect<EffectTableInfo["confectDocument"][]>;
  first(): Effect.Effect<Option.Option<EffectTableInfo["confectDocument"]>>;
  unique(): Effect.Effect<
    Option.Option<EffectTableInfo["confectDocument"]>,
    NotUniqueError
  >;
  stream(): Stream.Stream<EffectTableInfo["confectDocument"]>;
}

interface EffectOrderedQuery<EffectTableInfo extends GenericConfectTableInfo>
  extends Omit<EffectQuery<EffectTableInfo>, "order"> {}

class NotUniqueError {
  readonly _tag = "NotUniqueError";
}

class EffectQueryImpl<EffectTableInfo extends GenericConfectTableInfo>
  implements EffectQuery<EffectTableInfo>
{
  q: Query<TableInfoFromConfectTableInfo<EffectTableInfo>>;
  tableSchema: Schema.Schema<
    DocumentByInfo<TableInfoFromConfectTableInfo<EffectTableInfo>>
  >;
  constructor(
    q:
      | Query<TableInfoFromConfectTableInfo<EffectTableInfo>>
      | OrderedQuery<TableInfoFromConfectTableInfo<EffectTableInfo>>,
    tableSchema: Schema.Schema<
      EffectTableInfo["document"],
      EffectTableInfo["confectDocument"]
    >
  ) {
    this.q = q as Query<TableInfoFromConfectTableInfo<EffectTableInfo>>;
    this.tableSchema = tableSchema;
  }
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromConfectTableInfo<EffectTableInfo>>
    ) => Expression<boolean>
  ): this {
    return new EffectQueryImpl(
      this.q.filter(predicate),
      this.tableSchema
    ) as this;
  }
  order(order: "asc" | "desc"): EffectQueryImpl<EffectTableInfo> {
    return new EffectQueryImpl(this.q.order(order), this.tableSchema);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<PaginationResult<EffectTableInfo["confectDocument"]>> {
    return pipe(
      Effect.Do,
      Effect.bind("paginationResult", () =>
        Effect.promise(() => this.q.paginate(paginationOpts))
      ),
      Effect.bind("parsedPage", ({ paginationResult }) =>
        pipe(
          paginationResult.page,
          Effect.forEach((document) =>
            Schema.decodeUnknown(this.tableSchema)(document)
          )
        )
      ),
      Effect.map(
        ({
          paginationResult,
          parsedPage,
        }): PaginationResult<EffectTableInfo["confectDocument"]> => ({
          ...paginationResult,
          page: parsedPage,
        })
      ),
      Effect.orDie
    );
  }
  collect(): Effect.Effect<EffectTableInfo["confectDocument"][]> {
    return pipe(
      Effect.promise(() => this.q.collect()),
      Effect.flatMap(
        Effect.forEach((document) =>
          Schema.decodeUnknown(this.tableSchema)(document)
        )
      ),
      Effect.orDie
    );
  }
  take(n: number): Effect.Effect<EffectTableInfo["confectDocument"][]> {
    return pipe(
      this.stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map(
        (chunk) =>
          Chunk.toReadonlyArray(chunk) as EffectTableInfo["confectDocument"][]
      )
    );
  }
  first(): Effect.Effect<Option.Option<EffectTableInfo["confectDocument"]>> {
    return pipe(this.stream(), Stream.runHead);
  }
  unique(): Effect.Effect<
    Option.Option<EffectTableInfo["confectDocument"]>,
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
  stream(): Stream.Stream<EffectTableInfo["confectDocument"]> {
    return pipe(
      Stream.fromAsyncIterable(this.q, identity),
      Stream.mapEffect((document) =>
        Schema.decodeUnknown(this.tableSchema)(document)
      ),
      Stream.orDie
    );
  }
}

interface EffectQueryInitializer<
  EffectTableInfo extends GenericConfectTableInfo,
> extends EffectQuery<EffectTableInfo> {
  fullTableScan(): EffectQuery<EffectTableInfo>;
  withIndex<
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfoFromConfectTableInfo<EffectTableInfo>>,
            NamedIndex<
              TableInfoFromConfectTableInfo<EffectTableInfo>,
              IndexName
            >,
            0
          >
        ) => IndexRange)
      | undefined
  ): EffectQuery<EffectTableInfo>;
  withSearchIndex<
    IndexName extends keyof SearchIndexes<
      TableInfoFromConfectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<TableInfoFromConfectTableInfo<EffectTableInfo>>,
        NamedSearchIndex<
          TableInfoFromConfectTableInfo<EffectTableInfo>,
          IndexName
        >
      >
    ) => SearchFilter
  ): EffectOrderedQuery<EffectTableInfo>;
}

class EffectQueryInitializerImpl<
  EffectTableInfo extends GenericConfectTableInfo,
> implements EffectQueryInitializer<EffectTableInfo>
{
  q: QueryInitializer<TableInfoFromConfectTableInfo<EffectTableInfo>>;
  tableSchema: Schema.Schema<
    EffectTableInfo["document"],
    EffectTableInfo["confectDocument"]
  >;
  constructor(
    q: QueryInitializer<TableInfoFromConfectTableInfo<EffectTableInfo>>,
    tableSchema: Schema.Schema<
      EffectTableInfo["document"],
      EffectTableInfo["confectDocument"]
    >
  ) {
    this.q = q;
    this.tableSchema = tableSchema;
  }
  fullTableScan(): EffectQuery<EffectTableInfo> {
    return new EffectQueryImpl(this.q.fullTableScan(), this.tableSchema);
  }
  withIndex<
    IndexName extends keyof Indexes<
      TableInfoFromConfectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfoFromConfectTableInfo<EffectTableInfo>>,
            NamedIndex<
              TableInfoFromConfectTableInfo<EffectTableInfo>,
              IndexName
            >,
            0
          >
        ) => IndexRange)
      | undefined
  ): EffectQuery<EffectTableInfo> {
    return new EffectQueryImpl(
      this.q.withIndex(indexName, indexRange),
      this.tableSchema
    );
  }
  withSearchIndex<
    IndexName extends keyof SearchIndexes<
      TableInfoFromConfectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        EffectTableInfo["document"],
        NamedSearchIndex<
          TableInfoFromConfectTableInfo<EffectTableInfo>,
          IndexName
        >
      >
    ) => SearchFilter
  ): EffectOrderedQuery<EffectTableInfo> {
    return new EffectQueryImpl(
      this.q.withSearchIndex(indexName, searchFilter),
      this.tableSchema
    );
  }
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromConfectTableInfo<EffectTableInfo>>
    ) => Expression<boolean>
  ): this {
    return this.fullTableScan().filter(predicate) as this;
  }
  order(order: "asc" | "desc"): EffectOrderedQuery<EffectTableInfo> {
    return this.fullTableScan().order(order);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<PaginationResult<EffectTableInfo["confectDocument"]>> {
    return this.fullTableScan().paginate(paginationOpts);
  }
  collect(): Effect.Effect<EffectTableInfo["confectDocument"][]> {
    return this.fullTableScan().collect();
  }
  take(n: number): Effect.Effect<EffectTableInfo["confectDocument"][]> {
    return this.fullTableScan().take(n);
  }
  first(): Effect.Effect<Option.Option<EffectTableInfo["confectDocument"]>> {
    return this.fullTableScan().first();
  }
  unique(): Effect.Effect<
    Option.Option<EffectTableInfo["confectDocument"]>,
    NotUniqueError
  > {
    return this.fullTableScan().unique();
  }
  stream(): Stream.Stream<EffectTableInfo["confectDocument"]> {
    return this.fullTableScan().stream();
  }
}

export type DatabaseSchemasFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel]: Schema.Schema<
    ConfectDataModel[TableName]["confectDocument"],
    ConfectDataModel[TableName]["document"]
  >;
};

export interface EffectDatabaseReader<
  EffectDataModel extends GenericConfectDataModel,
> {
  query<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<EffectDataModel[TableName]>;
  get<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    Option.Option<EffectDataModel[TableName]["confectDocument"]>
  >;
  normalizeId<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
}

export class EffectDatabaseReaderImpl<
  ConfectDataModel extends GenericConfectDataModel,
> implements EffectDatabaseReader<ConfectDataModel>
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
  normalizeId<TableName extends TableNamesInDataModel<ConfectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  get<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<Option.Option<DocumentByName<ConfectDataModel, TableName>>> {
    return pipe(
      Effect.promise(() => this.db.get(id)),
      Effect.map(Option.fromNullable)
    );
  }
  query<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<ConfectDataModel[TableName]> {
    return new EffectQueryInitializerImpl(
      this.db.query(tableName),
      this.databaseSchemas[tableName]
    );
  }
}

export interface EffectDatabaseWriter<
  EffectDataModel extends GenericConfectDataModel,
> {
  query<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<EffectDataModel[TableName]>;
  get<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<Option.Option<DocumentByName<EffectDataModel, TableName>>>;
  normalizeId<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
  insert<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    table: TableName,
    value: WithoutSystemFields<
      ConfectDocumentByName<EffectDataModel, TableName>
    >
  ): Effect.Effect<GenericId<TableName>>;
  patch<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<void>;
  replace<TableName extends TableNamesInConfectDataModel<EffectDataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<void>;
  delete(id: GenericId<string>): Effect.Effect<void>;
}

export class EffectDatabaseWriterImpl<
  ConfectDataModel extends GenericConfectDataModel,
> implements EffectDatabaseWriter<ConfectDataModel>
{
  databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
  db: GenericDatabaseWriter<DataModelFromConfectDataModel<ConfectDataModel>>;
  reader: EffectDatabaseReader<ConfectDataModel>;
  constructor(
    db: GenericDatabaseWriter<DataModelFromConfectDataModel<ConfectDataModel>>,
    databaseSchemas: DatabaseSchemasFromConfectDataModel<ConfectDataModel>
  ) {
    this.db = db;
    // TODO: Does this need to be an instance variable?
    this.databaseSchemas = databaseSchemas;
    this.reader = new EffectDatabaseReaderImpl(db, databaseSchemas);
  }
  query<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<ConfectDataModel[TableName]> {
    return this.reader.query(tableName);
  }
  get<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<Option.Option<DocumentByName<ConfectDataModel, TableName>>> {
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
      Effect.flatMap((encodedValue) =>
        // TODO: Is there a way around not casting this?
        Effect.promise(() => this.db.insert(table, encodedValue as any))
      ),
      Effect.orDie
    );
  }
  patch<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<ConfectDataModel, TableName>>
  ): Effect.Effect<void> {
    return Effect.promise(() => this.db.patch(id, value));
  }
  replace<TableName extends TableNamesInConfectDataModel<ConfectDataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<ConfectDataModel, TableName>>
  ): Effect.Effect<void> {
    return Effect.promise(() => this.db.replace(id, value));
  }
  delete(id: GenericId<string>): Effect.Effect<void> {
    return Effect.promise(() => this.db.delete(id));
  }
}

export const databaseSchemasFromEffectSchema = <
  EffectSchema extends GenericConfectSchema,
>(
  effectSchema: EffectSchema
) =>
  Record.map(
    effectSchema,
    ({ schema }) => schema
  ) as DatabaseSchemasFromConfectDataModel<
    ConfectDataModelFromEffectSchema<EffectSchema>
  >;
