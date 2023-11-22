import { Schema } from "@effect/schema";
import {
  DocumentByInfo,
  DocumentByName,
  Expression,
  FilterBuilder,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericTableInfo,
  Indexes,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  NamedTableInfo,
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

interface EffectQuery<TableInfo extends GenericTableInfo, TypeScriptValue> {
  filter(
    predicate: (q: FilterBuilder<TableInfo>) => Expression<boolean>
  ): EffectQuery<TableInfo, TypeScriptValue>;
  order(order: "asc" | "desc"): EffectOrderedQuery<TableInfo, TypeScriptValue>;
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<TypeScriptValue>>;
  collect(): Effect.Effect<never, never, TypeScriptValue[]>;
  take(n: number): Effect.Effect<never, never, TypeScriptValue[]>;
  first(): Effect.Effect<never, never, Option.Option<TypeScriptValue>>;
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<TypeScriptValue>
  >;
  stream(): Stream.Stream<never, never, TypeScriptValue>;
}

interface EffectOrderedQuery<
  TableInfo extends GenericTableInfo,
  TypeScriptValue,
> extends Omit<EffectQuery<TableInfo, TypeScriptValue>, "order"> {}

class NotUniqueError {
  readonly _tag = "NotUniqueError";
}

class EffectQueryImpl<TableInfo extends GenericTableInfo, TypeScriptValue>
  implements EffectQuery<TableInfo, TypeScriptValue>
{
  q: Query<TableInfo>;
  tableSchema: Schema.Schema<DocumentByInfo<TableInfo>, TypeScriptValue>;
  constructor(
    q: Query<TableInfo> | OrderedQuery<TableInfo>,
    tableSchema: Schema.Schema<DocumentByInfo<TableInfo>, TypeScriptValue>
  ) {
    this.q = q as Query<TableInfo>;
    this.tableSchema = tableSchema;
  }
  filter(
    predicate: (q: FilterBuilder<TableInfo>) => Expression<boolean>
  ): this {
    return new EffectQueryImpl(
      this.q.filter(predicate),
      this.tableSchema
    ) as this;
  }
  order(order: "asc" | "desc"): EffectQueryImpl<TableInfo, TypeScriptValue> {
    return new EffectQueryImpl(this.q.order(order), this.tableSchema);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<TypeScriptValue>> {
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
        }): PaginationResult<TypeScriptValue> => ({
          ...paginationResult,
          page: parsedPage,
        })
      ),
      Effect.orDie
    );
  }
  collect(): Effect.Effect<never, never, TypeScriptValue[]> {
    return pipe(
      Effect.promise(() => this.q.collect()),
      Effect.flatMap(
        Effect.forEach((document) => Schema.parse(this.tableSchema)(document))
      ),
      Effect.orDie
    );
  }
  take(n: number): Effect.Effect<never, never, TypeScriptValue[]> {
    return pipe(
      this.stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk) as TypeScriptValue[])
    );
  }
  first(): Effect.Effect<never, never, Option.Option<TypeScriptValue>> {
    return pipe(this.stream(), Stream.runHead);
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<TypeScriptValue>
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
  stream(): Stream.Stream<never, never, TypeScriptValue> {
    return pipe(
      Stream.fromAsyncIterable(this.q, identity),
      Stream.mapEffect((document) => Schema.parse(this.tableSchema)(document)),
      Stream.orDie
    );
  }
}

interface EffectQueryInitializer<
  TableInfo extends GenericTableInfo,
  TypeScriptValue,
> extends EffectQuery<TableInfo, TypeScriptValue> {
  fullTableScan(): EffectQuery<TableInfo, TypeScriptValue>;
  withIndex<IndexName extends keyof Indexes<TableInfo>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfo>,
            NamedIndex<TableInfo, IndexName>,
            0
          >
        ) => IndexRange)
      | undefined
  ): EffectQuery<TableInfo, TypeScriptValue>;
  withSearchIndex<IndexName extends keyof SearchIndexes<TableInfo>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<TableInfo>,
        NamedSearchIndex<TableInfo, IndexName>
      >
    ) => SearchFilter
  ): EffectOrderedQuery<TableInfo, TypeScriptValue>;
}

class EffectQueryInitializerImpl<
  TableInfo extends GenericTableInfo,
  TypeScriptValue,
> implements EffectQueryInitializer<TableInfo, TypeScriptValue>
{
  q: QueryInitializer<TableInfo>;
  tableSchema: Schema.Schema<DocumentByInfo<TableInfo>, TypeScriptValue>;
  constructor(
    q: QueryInitializer<TableInfo>,
    tableSchema: Schema.Schema<DocumentByInfo<TableInfo>, TypeScriptValue>
  ) {
    this.q = q;
    this.tableSchema = tableSchema;
  }
  fullTableScan(): EffectQuery<TableInfo, TypeScriptValue> {
    return new EffectQueryImpl(this.q.fullTableScan(), this.tableSchema);
  }
  withIndex<IndexName extends keyof Indexes<TableInfo>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<
            DocumentByInfo<TableInfo>,
            NamedIndex<TableInfo, IndexName>,
            0
          >
        ) => IndexRange)
      | undefined
  ): EffectQuery<TableInfo, TypeScriptValue> {
    return new EffectQueryImpl(
      this.q.withIndex(indexName, indexRange),
      this.tableSchema
    );
  }
  withSearchIndex<IndexName extends keyof SearchIndexes<TableInfo>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<
        DocumentByInfo<TableInfo>,
        NamedSearchIndex<TableInfo, IndexName>
      >
    ) => SearchFilter
  ): EffectOrderedQuery<TableInfo, TypeScriptValue> {
    return new EffectQueryImpl(
      this.q.withSearchIndex(indexName, searchFilter),
      this.tableSchema
    );
  }
  filter(
    predicate: (q: FilterBuilder<TableInfo>) => Expression<boolean>
  ): this {
    return this.fullTableScan().filter(predicate) as this;
  }
  order(order: "asc" | "desc"): EffectOrderedQuery<TableInfo, TypeScriptValue> {
    return this.fullTableScan().order(order);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<TypeScriptValue>> {
    return this.fullTableScan().paginate(paginationOpts);
  }
  collect(): Effect.Effect<never, never, TypeScriptValue[]> {
    return this.fullTableScan().collect();
  }
  take(n: number): Effect.Effect<never, never, TypeScriptValue[]> {
    return this.fullTableScan().take(n);
  }
  first(): Effect.Effect<never, never, Option.Option<TypeScriptValue>> {
    return this.fullTableScan().first();
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<TypeScriptValue>
  > {
    return this.fullTableScan().unique();
  }
  stream(): Stream.Stream<never, never, TypeScriptValue> {
    return this.fullTableScan().stream();
  }
}

export interface EffectDatabaseReader<DataModel extends GenericDataModel> {
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>>;
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<DataModel, TableName>>
  >;
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
}

export class EffectDatabaseReaderImpl<
  Ctx extends GenericQueryCtx<DataModel>,
  DataModel extends GenericDataModel,
> implements EffectDatabaseReader<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseReader<DataModel>;
  constructor(ctx: Ctx, db: GenericDatabaseReader<DataModel>) {
    this.ctx = ctx;
    this.db = db;
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<DataModel, TableName>>
  > {
    return pipe(
      Effect.promise(() => this.db.get(id)),
      Effect.map(Option.fromNullable)
    );
  }
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return new EffectQueryInitializerImpl(this.db.query(tableName));
  }
}

export interface EffectDatabaseWriter<DataModel extends GenericDataModel> {
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>>;
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<DataModel, TableName>>
  >;
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
  insert<TableName extends string>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<DataModel, TableName>>
  ): Effect.Effect<never, never, GenericId<TableName>>;
  patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<DataModel, TableName>>
  ): Effect.Effect<never, never, void>;
  replace<TableName extends string>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>
  ): Effect.Effect<never, never, void>;
  delete(id: GenericId<string>): Effect.Effect<never, never, void>;
}

export class EffectDatabaseWriterImpl<
  Ctx extends GenericMutationCtx<DataModel>,
  DataModel extends GenericDataModel,
> implements EffectDatabaseWriter<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseWriter<DataModel>;
  reader: EffectDatabaseReader<DataModel>;
  constructor(ctx: Ctx, db: GenericDatabaseWriter<DataModel>) {
    this.ctx = ctx;
    this.db = db;
    this.reader = new EffectDatabaseReaderImpl(ctx, db);
  }
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return this.reader.query(tableName);
  }
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<DataModel, TableName>>
  > {
    return this.reader.get(id);
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  insert<TableName extends string>(
    table: TableName,
    value: WithoutSystemFields<DocumentByName<DataModel, TableName>>
  ): Effect.Effect<never, never, GenericId<TableName>> {
    return Effect.promise(() => this.db.insert(table, value));
  }
  patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<DocumentByName<DataModel, TableName>>
  ): Effect.Effect<never, never, void> {
    return Effect.promise(() => this.db.patch(id, value));
  }
  replace<TableName extends string>(
    id: GenericId<TableName>,
    value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>
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
