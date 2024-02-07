import { Schema } from "@effect/schema";
import {
  DocumentByInfo,
  DocumentByName,
  Expression,
  FilterBuilder,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDocument,
  GenericMutationCtx,
  GenericQueryCtx,
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
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";
import { Chunk, Effect, identity, Option, pipe, Stream } from "effect";

import {
  DataModelFromEffectDataModel,
  GenericEffectDataModel,
  GenericEffectTableInfo,
  TableInfoFromEffectTableInfo,
  TableNamesInEffectDataModel,
} from "./schema";

interface EffectQuery<EffectTableInfo extends GenericEffectTableInfo> {
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromEffectTableInfo<EffectTableInfo>>
    ) => Expression<boolean>
  ): EffectQuery<EffectTableInfo>;
  order(order: "asc" | "desc"): EffectOrderedQuery<EffectTableInfo>;
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<
    never,
    never,
    PaginationResult<EffectTableInfo["effectDocument"]>
  >;
  collect(): Effect.Effect<never, never, EffectTableInfo["effectDocument"][]>;
  take(
    n: number
  ): Effect.Effect<never, never, EffectTableInfo["effectDocument"][]>;
  first(): Effect.Effect<
    never,
    never,
    Option.Option<EffectTableInfo["effectDocument"]>
  >;
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<EffectTableInfo["effectDocument"]>
  >;
  stream(): Stream.Stream<never, never, EffectTableInfo["effectDocument"]>;
}

interface EffectOrderedQuery<EffectTableInfo extends GenericEffectTableInfo>
  extends Omit<EffectQuery<EffectTableInfo>, "order"> {}

class NotUniqueError {
  readonly _tag = "NotUniqueError";
}

class EffectQueryImpl<EffectTableInfo extends GenericEffectTableInfo>
  implements EffectQuery<EffectTableInfo>
{
  q: Query<TableInfoFromEffectTableInfo<EffectTableInfo>>;
  tableSchema: Schema.Schema<
    DocumentByInfo<TableInfoFromEffectTableInfo<EffectTableInfo>>
  >;
  constructor(
    q:
      | Query<TableInfoFromEffectTableInfo<EffectTableInfo>>
      | OrderedQuery<TableInfoFromEffectTableInfo<EffectTableInfo>>,
    tableSchema: Schema.Schema<
      EffectTableInfo["document"],
      EffectTableInfo["effectDocument"]
    >
  ) {
    this.q = q as Query<TableInfoFromEffectTableInfo<EffectTableInfo>>;
    this.tableSchema = tableSchema;
  }
  filter(
    predicate: (
      q: FilterBuilder<TableInfoFromEffectTableInfo<EffectTableInfo>>
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
  ): Effect.Effect<
    never,
    never,
    PaginationResult<EffectTableInfo["effectDocument"]>
  > {
    return pipe(
      Effect.Do,
      Effect.bind("paginationResult", () =>
        Effect.promise(() => this.q.paginate(paginationOpts))
      ),
      Effect.bind("parsedPage", ({ paginationResult }) =>
        pipe(
          paginationResult.page,
          Effect.forEach((document) => Schema.parse(this.tableSchema)(document))
        )
      ),
      Effect.map(
        ({
          paginationResult,
          parsedPage,
        }): PaginationResult<EffectTableInfo["effectDocument"]> => ({
          ...paginationResult,
          page: parsedPage,
        })
      ),
      Effect.orDie
    );
  }
  collect(): Effect.Effect<never, never, EffectTableInfo["effectDocument"][]> {
    return pipe(
      Effect.promise(() => this.q.collect()),
      Effect.flatMap(
        Effect.forEach((document) => Schema.parse(this.tableSchema)(document))
      ),
      Effect.orDie
    );
  }
  take(
    n: number
  ): Effect.Effect<never, never, EffectTableInfo["effectDocument"][]> {
    return pipe(
      this.stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map(
        (chunk) =>
          Chunk.toReadonlyArray(chunk) as EffectTableInfo["effectDocument"][]
      )
    );
  }
  first(): Effect.Effect<
    never,
    never,
    Option.Option<EffectTableInfo["effectDocument"]>
  > {
    return pipe(this.stream(), Stream.runHead);
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<EffectTableInfo["effectDocument"]>
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
  stream(): Stream.Stream<never, never, EffectTableInfo["effectDocument"]> {
    return pipe(
      Stream.fromAsyncIterable(this.q, identity),
      Stream.mapEffect((document) => Schema.parse(this.tableSchema)(document)),
      Stream.orDie
    );
  }
}

interface EffectQueryInitializer<EffectTableInfo extends GenericEffectTableInfo>
  extends EffectQuery<EffectTableInfo> {
  fullTableScan(): EffectQuery<EffectTableInfo>;
  withIndex<
    IndexName extends keyof Indexes<
      TableInfoFromEffectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfoFromEffectTableInfo<EffectTableInfo>>,
            NamedIndex<
              TableInfoFromEffectTableInfo<EffectTableInfo>,
              IndexName
            >,
            0
          >
        ) => IndexRange)
      | undefined
  ): EffectQuery<EffectTableInfo>;
  withSearchIndex<
    IndexName extends keyof SearchIndexes<
      TableInfoFromEffectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<TableInfoFromEffectTableInfo<EffectTableInfo>>,
        NamedSearchIndex<
          TableInfoFromEffectTableInfo<EffectTableInfo>,
          IndexName
        >
      >
    ) => SearchFilter
  ): EffectOrderedQuery<EffectTableInfo>;
}

class EffectQueryInitializerImpl<EffectTableInfo extends GenericEffectTableInfo>
  implements EffectQueryInitializer<EffectTableInfo>
{
  q: QueryInitializer<TableInfoFromEffectTableInfo<EffectTableInfo>>;
  tableSchema: Schema.Schema<
    EffectTableInfo["document"],
    EffectTableInfo["effectDocument"]
  >;
  constructor(
    q: QueryInitializer<TableInfoFromEffectTableInfo<EffectTableInfo>>,
    tableSchema: Schema.Schema<
      EffectTableInfo["document"],
      EffectTableInfo["effectDocument"]
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
      TableInfoFromEffectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfoFromEffectTableInfo<EffectTableInfo>>,
            NamedIndex<
              TableInfoFromEffectTableInfo<EffectTableInfo>,
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
      TableInfoFromEffectTableInfo<EffectTableInfo>
    >,
  >(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        EffectTableInfo["document"],
        NamedSearchIndex<
          TableInfoFromEffectTableInfo<EffectTableInfo>,
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
      q: FilterBuilder<TableInfoFromEffectTableInfo<EffectTableInfo>>
    ) => Expression<boolean>
  ): this {
    return this.fullTableScan().filter(predicate) as this;
  }
  order(order: "asc" | "desc"): EffectOrderedQuery<EffectTableInfo> {
    return this.fullTableScan().order(order);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<
    never,
    never,
    PaginationResult<EffectTableInfo["effectDocument"]>
  > {
    return this.fullTableScan().paginate(paginationOpts);
  }
  collect(): Effect.Effect<never, never, EffectTableInfo["effectDocument"][]> {
    return this.fullTableScan().collect();
  }
  take(
    n: number
  ): Effect.Effect<never, never, EffectTableInfo["effectDocument"][]> {
    return this.fullTableScan().take(n);
  }
  first(): Effect.Effect<
    never,
    never,
    Option.Option<EffectTableInfo["effectDocument"]>
  > {
    return this.fullTableScan().first();
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<EffectTableInfo["effectDocument"]>
  > {
    return this.fullTableScan().unique();
  }
  stream(): Stream.Stream<never, never, EffectTableInfo["effectDocument"]> {
    return this.fullTableScan().stream();
  }
}

type DatabaseSchemasFromEffectDataModel<
  EffectDataModel extends GenericEffectDataModel,
> = {
  [TableName in keyof EffectDataModel]: Schema.Schema<
    EffectDataModel[TableName]["document"],
    EffectDataModel[TableName]["effectDocument"]
  >;
};

export interface EffectDatabaseReader<
  EffectDataModel extends GenericEffectDataModel,
> {
  query<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<EffectDataModel[TableName]>;
  get<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<EffectDataModel[TableName]["effectDocument"]>
  >;
  normalizeId<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
}

export class EffectDatabaseReaderImpl<
  Ctx extends GenericQueryCtx<DataModelFromEffectDataModel<EffectDataModel>>,
  EffectDataModel extends GenericEffectDataModel,
> implements EffectDatabaseReader<EffectDataModel>
{
  ctx: Ctx;
  db: GenericDatabaseReader<DataModelFromEffectDataModel<EffectDataModel>>;
  databaseSchemas: DatabaseSchemasFromEffectDataModel<EffectDataModel>;
  constructor(
    ctx: Ctx,
    db: GenericDatabaseReader<DataModelFromEffectDataModel<EffectDataModel>>,
    databaseSchemas: DatabaseSchemasFromEffectDataModel<EffectDataModel>
  ) {
    this.ctx = ctx;
    this.db = db;
    this.databaseSchemas = databaseSchemas;
  }
  normalizeId<TableName extends TableNamesInDataModel<EffectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  get<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<EffectDataModel, TableName>>
  > {
    return pipe(
      Effect.promise(() => this.db.get(id)),
      Effect.map(Option.fromNullable)
    );
  }
  query<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<EffectDataModel[TableName]> {
    return new EffectQueryInitializerImpl(
      this.db.query(tableName),
      this.databaseSchemas[tableName]
    );
  }
}

export interface EffectDatabaseWriter<
  EffectDataModel extends GenericEffectDataModel,
> {
  query<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<EffectDataModel[TableName]>;
  get<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<EffectDataModel, TableName>>
  >;
  normalizeId<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
  insert<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<never, never, GenericId<TableName>>;
  patch<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<never, never, void>;
  replace<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<never, never, void>;
  delete(id: GenericId<string>): Effect.Effect<never, never, void>;
}

export class EffectDatabaseWriterImpl<
  Ctx extends GenericMutationCtx<DataModelFromEffectDataModel<EffectDataModel>>,
  EffectDataModel extends GenericEffectDataModel,
> implements EffectDatabaseWriter<EffectDataModel>
{
  ctx: Ctx;
  db: GenericDatabaseWriter<DataModelFromEffectDataModel<EffectDataModel>>;
  databaseSchemas: DatabaseSchemasFromEffectDataModel<EffectDataModel>;
  reader: EffectDatabaseReader<EffectDataModel>;
  constructor(
    ctx: Ctx,
    db: GenericDatabaseWriter<DataModelFromEffectDataModel<EffectDataModel>>,
    databaseSchemas: DatabaseSchemasFromEffectDataModel<EffectDataModel>
  ) {
    this.ctx = ctx;
    this.db = db;
    // TODO: Does this need to be an instance variable?
    this.databaseSchemas = databaseSchemas;
    this.reader = new EffectDatabaseReaderImpl(ctx, db, databaseSchemas);
  }
  query<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName
  ): EffectQueryInitializer<EffectDataModel[TableName]> {
    return this.reader.query(tableName);
  }
  get<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<EffectDataModel, TableName>>
  > {
    return this.reader.get(id);
  }
  normalizeId<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  insert<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<never, never, GenericId<TableName>> {
    return Effect.promise(() => this.db.insert(table, value));
  }
  patch<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<never, never, void> {
    return Effect.promise(() => this.db.patch(id, value));
  }
  replace<TableName extends TableNamesInEffectDataModel<EffectDataModel>>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<EffectDataModel, TableName>>
  ): Effect.Effect<never, never, void> {
    return Effect.promise(() => this.db.replace(id, value));
  }
  delete(id: GenericId<string>): Effect.Effect<never, never, void> {
    return Effect.promise(() => this.db.delete(id));
  }
}

// NOTE: These types are copied from convex/src/server/system_fields.ts -- ideally they would be exposed!

type WithOptionalSystemFields<Document extends GenericDocument> = Expand<
  WithoutSystemFields<Document> &
    Partial<Pick<Document, keyof SystemFields | "_id">>
>;

type SystemFields = {
  _creationTime: number;
};

type Expand<ObjectType extends Record<any, any>> = ObjectType extends Record<
  any,
  any
>
  ? {
      [Key in keyof ObjectType]: ObjectType[Key];
    }
  : never;
