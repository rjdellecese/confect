import {
  ArgsArray,
  Auth,
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
  Scheduler,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexes,
  StorageWriter,
  TableNamesInDataModel,
  WithoutSystemFields,
} from "convex/server";
import { GenericId } from "convex/values";
import { Chunk, Effect, identity, Option, pipe, Stream } from "effect";

type EffectMutationCtx<DataModel extends GenericDataModel> = {
  db: EffectDatabaseWriter<DataModel>;
  auth: Auth;
  storage: StorageWriter;
  scheduler: Scheduler;
};

type EffectQueryCtx<DataModel extends GenericDataModel> = {
  db: EffectDatabaseReader<DataModel>;
  auth: Auth;
  storage: StorageWriter;
  scheduler: Scheduler;
};

/**
 * Apply row level security (RLS) to queries and mutations with the returned
 * middleware functions.
 *
 * Example:
 * ```
 * // Defined in a common file so it can be used by all queries and mutations.
 * import { Auth } from "convex/server";
 * import { DataModel } from "./_generated/dataModel";
 * import { DatabaseReader } from "./_generated/server";
 * import { RowLevelSecurity } from "./rowLevelSecurity";
 *
 * export const {withMutationRLS} = RowLevelSecurity<{auth: Auth, db: DatabaseReader}, DataModel>(
 *  {
 *    cookies: {
 *      read: async ({auth}, cookie) => !cookie.eaten,
 *      modify: async ({auth, db}, cookie) => {
 *        const user = await getUser(auth, db);
 *        return user.isParent;  // only parents can reach the cookies.
 *      },
 *  }
 * );
 * // Mutation with row level security enabled.
 * export const eatCookie = mutation(withMutationRLS(
 *  async ({db}, {cookieId}) => {
 *   // throws "does not exist" error if cookie is already eaten or doesn't exist.
 *   // throws "write access" error if authorized user is not a parent.
 *   await db.patch(cookieId, {eaten: true});
 * }));
 * ```
 *
 * Notes:
 * * Rules may read any row in `db` -- rules do not apply recursively within the
 *   rule functions themselves.
 * * Tables with no rule default to full access.
 * * Middleware functions like `withUser` can be composed with RowLevelSecurity
 *   to cache fetches in `ctx`. e.g.
 * ```
 * const {withQueryRLS} = RowLevelSecurity<{user: Doc<"users">}, DataModel>(
 *  {
 *    cookies: async ({user}, cookie) => user.isParent,
 *  }
 * );
 * export default query(withUser(withRLS(...)));
 * ```
 *
 * @param rules - rule for each table, determining whether a row is accessible.
 *  - "read" rule says whether a document should be visible.
 *  - "modify" rule says whether to throw an error on `replace`, `patch`, and `delete`.
 *  - "insert" rule says whether to throw an error on `insert`.
 *
 * @returns Functions `withQueryRLS` and `withMutationRLS` to be passed to
 * `query` or `mutation` respectively.
 *  For each row read, modified, or inserted, the security rules are applied.
 */
export const RowLevelSecurity = <DataModel extends GenericDataModel>() => {
  const withEffectQuery = <Args extends ArgsArray, Output>(
    f: (ctx: EffectMutationCtx<DataModel>, ...args: Args) => Output
  ): Handler<DataModel, GenericMutationCtx<DataModel>, Args, Output> => {
    return ((ctx: GenericMutationCtx<DataModel>, ...args: Args) => {
      const wrappedDb = new EffectDatabaseWriterImpl(ctx, ctx.db);
      return f({ ...ctx, db: wrappedDb }, ...args);
    }) as Handler<DataModel, GenericMutationCtx<DataModel>, Args, Output>;
  };
  const withEffectMutation = <Args extends ArgsArray, Output>(
    f: (ctx: EffectQueryCtx<DataModel>, ...args: Args) => Output
  ): Handler<DataModel, GenericQueryCtx<DataModel>, Args, Output> => {
    return ((ctx: any, ...args: any[]) => {
      const wrappedDb = new EffectDatabaseReaderImpl(ctx, ctx.db);
      return (f as any)({ ...ctx, db: wrappedDb }, ...args);
    }) as Handler<DataModel, GenericQueryCtx<DataModel>, Args, Output>;
  };
  return {
    withEffectQuery,
    withEffectMutation,
  };
};

type Handler<
  DataModel extends GenericDataModel,
  Ctx extends GenericQueryCtx<DataModel>,
  Args extends ArgsArray,
  Output,
> = (ctx: Ctx, ...args: Args) => Output;

interface EffectQuery<T extends GenericTableInfo> {
  filter(
    predicate: (q: FilterBuilder<T>) => Expression<boolean>
  ): EffectQuery<T>;
  order(order: "asc" | "desc"): EffectOrderedQuery<T>;
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<DocumentByInfo<T>>>;
  collect(): Effect.Effect<never, never, DocumentByInfo<T>[]>;
  take(n: number): Effect.Effect<never, never, DocumentByInfo<T>[]>;
  first(): Effect.Effect<never, never, Option.Option<DocumentByInfo<T>>>;
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<DocumentByInfo<T>>
  >;
  stream(): Stream.Stream<never, never, DocumentByInfo<T>>;
}

interface EffectOrderedQuery<T extends GenericTableInfo>
  extends Omit<EffectQuery<T>, "order"> {}

class NotUniqueError {
  readonly _tag = "NotUniqueError";
}

class EffectQueryImpl<T extends GenericTableInfo> implements EffectQuery<T> {
  q: Query<T>;
  constructor(q: Query<T> | OrderedQuery<T>) {
    this.q = q as Query<T>;
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return new EffectQueryImpl(this.q.filter(predicate)) as this;
  }
  order(order: "asc" | "desc"): EffectQueryImpl<T> {
    return new EffectQueryImpl(this.q.order(order));
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<DocumentByInfo<T>>> {
    return Effect.promise(() => this.q.paginate(paginationOpts));
  }
  collect(): Effect.Effect<never, never, DocumentByInfo<T>[]> {
    return Effect.promise(() => this.q.collect());
  }
  take(n: number): Effect.Effect<never, never, DocumentByInfo<T>[]> {
    return pipe(
      this.stream(),
      Stream.take(n),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk) as DocumentByInfo<T>[])
    );
  }
  first(): Effect.Effect<never, never, Option.Option<DocumentByInfo<T>>> {
    return pipe(this.stream(), Stream.runHead);
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<DocumentByInfo<T>>
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
  stream(): Stream.Stream<never, never, DocumentByInfo<T>> {
    return pipe(Stream.fromAsyncIterable(this.q, identity), Stream.orDie);
  }
}

interface EffectQueryInitializer<T extends GenericTableInfo>
  extends EffectQuery<T> {
  fullTableScan(): EffectQuery<T>;
  withIndex<IndexName extends keyof Indexes<T>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>, 0>
        ) => IndexRange)
      | undefined
  ): EffectQuery<T>;
  withSearchIndex<IndexName extends keyof SearchIndexes<T>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<DocumentByInfo<T>, NamedSearchIndex<T, IndexName>>
    ) => SearchFilter
  ): EffectOrderedQuery<T>;
}

class EffectQueryInitializerImpl<T extends GenericTableInfo>
  implements EffectQueryInitializer<T>
{
  q: QueryInitializer<T>;
  constructor(q: QueryInitializer<T>) {
    this.q = q;
  }
  fullTableScan(): EffectQuery<T> {
    return new EffectQueryImpl(this.q.fullTableScan());
  }
  withIndex<IndexName extends keyof Indexes<T>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>, 0>
        ) => IndexRange)
      | undefined
  ): EffectQuery<T> {
    return new EffectQueryImpl(this.q.withIndex(indexName, indexRange));
  }
  withSearchIndex<IndexName extends keyof SearchIndexes<T>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<DocumentByInfo<T>, NamedSearchIndex<T, IndexName>>
    ) => SearchFilter
  ): EffectOrderedQuery<T> {
    return new EffectQueryImpl(this.q.withSearchIndex(indexName, searchFilter));
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return this.fullTableScan().filter(predicate) as this;
  }
  order(order: "asc" | "desc"): EffectOrderedQuery<T> {
    return this.fullTableScan().order(order);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<DocumentByInfo<T>>> {
    return this.fullTableScan().paginate(paginationOpts);
  }
  collect(): Effect.Effect<never, never, DocumentByInfo<T>[]> {
    return this.fullTableScan().collect();
  }
  take(n: number): Effect.Effect<never, never, DocumentByInfo<T>[]> {
    return this.fullTableScan().take(n);
  }
  first(): Effect.Effect<never, never, Option.Option<DocumentByInfo<T>>> {
    return this.fullTableScan().first();
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<DocumentByInfo<T>>
  > {
    return this.fullTableScan().unique();
  }
  stream(): Stream.Stream<never, never, DocumentByInfo<T>> {
    return this.fullTableScan().stream();
  }
}

interface EffectDatabaseReader<DataModel extends GenericDataModel> {
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

class EffectDatabaseReaderImpl<
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

interface EffectDatabaseWriter<DataModel extends GenericDataModel> {
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
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<DataModel, TableName>>
  >;
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>>;
}

class EffectDatabaseWriterImpl<
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

  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<
    never,
    never,
    Option.Option<DocumentByName<DataModel, TableName>>
  > {
    return this.reader.get(id);
  }

  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return this.reader.query(tableName);
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
