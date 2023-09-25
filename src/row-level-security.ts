import {
  ArgsArray,
  DocumentByInfo,
  DocumentByName,
  Expression,
  FilterBuilder,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
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
import {
  Chunk,
  Effect,
  identity,
  Option,
  pipe,
  ReadonlyArray,
  Stream,
} from "effect";

type Rule<Ctx, Doc> = (
  ctx: Ctx,
  doc: Doc
) => Effect.Effect<never, never, boolean>;

export type Rules<Ctx, DataModel extends GenericDataModel> = {
  [T in TableNamesInDataModel<DataModel>]?: {
    read?: Rule<Ctx, DocumentByName<DataModel, T>>;
    modify?: Rule<Ctx, DocumentByName<DataModel, T>>;
    insert?: Rule<Ctx, WithoutSystemFields<DocumentByName<DataModel, T>>>;
  };
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
export const RowLevelSecurity = <RuleCtx, DataModel extends GenericDataModel>(
  rules: Rules<RuleCtx, DataModel>
) => {
  const withMutationRLS = <
    Ctx extends GenericMutationCtx<DataModel>,
    Args extends ArgsArray,
    Output,
  >(
    f: Handler<Ctx, Args, Output>
  ): Handler<Ctx, Args, Output> => {
    return ((ctx: any, ...args: any[]) => {
      const wrappedDb = new WrapWriter(ctx, ctx.db, rules);
      return (f as any)({ ...ctx, db: wrappedDb }, ...args);
    }) as Handler<Ctx, Args, Output>;
  };
  const withQueryRLS = <
    Ctx extends GenericQueryCtx<DataModel>,
    Args extends ArgsArray,
    Output,
  >(
    f: Handler<Ctx, Args, Output>
  ): Handler<Ctx, Args, Output> => {
    return ((ctx: any, ...args: any[]) => {
      const wrappedDb = new WrapReader(ctx, ctx.db, rules);
      return (f as any)({ ...ctx, db: wrappedDb }, ...args);
    }) as Handler<Ctx, Args, Output>;
  };
  return {
    withMutationRLS,
    withQueryRLS,
  };
};

type Handler<Ctx, Args extends ArgsArray, Output> = (
  ctx: Ctx,
  ...args: Args
) => Output;

type AuthPredicate<T extends GenericTableInfo> = (
  doc: DocumentByInfo<T>
) => Effect.Effect<never, never, boolean>;

// TODO: Is this how it should work? Filtering rather than raising an error? I'm not so sure...
const filter = <T>(
  arr: T[],
  predicate: (doc: T) => Effect.Effect<never, never, boolean>
): Effect.Effect<never, never, T[]> => Effect.filter(arr, predicate);

interface EffectQuery<T extends GenericTableInfo>
  extends AsyncIterable<DocumentByInfo<T>>,
    AsyncIterator<DocumentByInfo<T>> {
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
}

interface EffectOrderedQuery<T extends GenericTableInfo>
  extends Omit<EffectQuery<T>, "order"> {}

class NotUniqueError {
  readonly _tag = "NotUniqueError";
}

class WrapQuery<T extends GenericTableInfo> implements EffectQuery<T> {
  q: Query<T>;
  p: AuthPredicate<T>;
  iterator?: AsyncIterator<any>;
  constructor(q: Query<T> | OrderedQuery<T>, p: AuthPredicate<T>) {
    this.q = q as Query<T>;
    this.p = p;
  }
  filter(predicate: (q: FilterBuilder<T>) => Expression<boolean>): this {
    return new WrapQuery(this.q.filter(predicate), this.p) as this;
  }
  order(order: "asc" | "desc"): WrapQuery<T> {
    return new WrapQuery(this.q.order(order), this.p);
  }
  paginate(
    paginationOpts: PaginationOptions
  ): Effect.Effect<never, never, PaginationResult<DocumentByInfo<T>>> {
    // TODO: Perhaps it's better to raise an error here if the auth predicate ever returns false, rather than trying to filter out those results?
    return pipe(
      Effect.promise(() => this.q.paginate(paginationOpts)),
      Effect.map((result) => ({
        ...result,
        page: result.page.filter(this.p),
      }))
    );
  }
  collect(): Effect.Effect<never, never, DocumentByInfo<T>[]> {
    return pipe(
      Effect.promise(() => this.q.collect()),
      Effect.flatMap((results) => filter(results, this.p))
    );
  }
  take(n: number): Effect.Effect<never, never, DocumentByInfo<T>[]> {
    return pipe(
      Stream.fromAsyncIterable(this, identity),
      Stream.take(n),
      Stream.runCollect,
      Effect.map(
        (chunk) => Chunk.toReadonlyArray(chunk) as DocumentByInfo<T>[]
      ),
      Effect.orDie
    );
  }
  first(): Effect.Effect<never, never, Option.Option<DocumentByInfo<T>>> {
    return pipe(
      Stream.fromAsyncIterable(this, identity),
      Stream.runHead,
      Effect.orDie
    );
  }
  unique(): Effect.Effect<
    never,
    NotUniqueError,
    Option.Option<DocumentByInfo<T>>
  > {
    return pipe(
      Stream.fromAsyncIterable(this, identity),
      Stream.take(2),
      Stream.runCollect,
      Effect.orDie,
      Effect.flatMap((chunk) =>
        Chunk.get(chunk, 1)
          ? Effect.fail(new NotUniqueError())
          : Effect.succeed(Chunk.get(chunk, 0))
      )
    );
  }
  [Symbol.asyncIterator](): AsyncIterator<DocumentByInfo<T>, any, undefined> {
    this.iterator = this.q[Symbol.asyncIterator]();
    return this;
  }
  async next(): Promise<IteratorResult<any>> {
    for (;;) {
      const { value, done } = await this.iterator!.next();
      if (value && (await this.p(value))) {
        return { value, done };
      }
      if (done) {
        return { value: null, done: true };
      }
    }
  }
  return() {
    return this.iterator!.return!();
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

class WrapQueryInitializer<T extends GenericTableInfo>
  implements EffectQueryInitializer<T>
{
  q: QueryInitializer<T>;
  p: AuthPredicate<T>;
  constructor(q: QueryInitializer<T>, p: AuthPredicate<T>) {
    this.q = q;
    this.p = p;
  }
  fullTableScan(): EffectQuery<T> {
    return new WrapQuery(this.q.fullTableScan(), this.p);
  }
  withIndex<IndexName extends keyof Indexes<T>>(
    indexName: IndexName,
    indexRange?:
      | ((
          q: IndexRangeBuilder<DocumentByInfo<T>, NamedIndex<T, IndexName>, 0>
        ) => IndexRange)
      | undefined
  ): EffectQuery<T> {
    return new WrapQuery(this.q.withIndex(indexName, indexRange), this.p);
  }
  withSearchIndex<IndexName extends keyof SearchIndexes<T>>(
    indexName: IndexName,
    searchFilter: (
      q: SearchFilterBuilder<DocumentByInfo<T>, NamedSearchIndex<T, IndexName>>
    ) => SearchFilter
  ): EffectOrderedQuery<T> {
    return new WrapQuery(
      this.q.withSearchIndex(indexName, searchFilter),
      this.p
    );
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
  [Symbol.asyncIterator](): AsyncIterator<DocumentByInfo<T>> {
    return this.fullTableScan()[Symbol.asyncIterator]();
  }
  next() {
    return this.fullTableScan().next();
  }
}

interface EffectDatabaseReader<DataModel extends GenericDataModel> {
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>>;
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<never, never, Option.Option<any>>;
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
  tableName<TableName extends string>(
    id: GenericId<TableName>
  ): Option.Option<TableName>;
}

class WrapReader<Ctx, DataModel extends GenericDataModel>
  implements EffectDatabaseReader<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseReader<DataModel>;
  rules: Rules<Ctx, DataModel>;

  constructor(
    ctx: Ctx,
    db: GenericDatabaseReader<DataModel>,
    rules: Rules<Ctx, DataModel>
  ) {
    this.ctx = ctx;
    this.db = db;
    this.rules = rules;
  }

  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }

  tableName<TableName extends string>(
    id: GenericId<TableName>
  ): Option.Option<TableName> {
    return pipe(
      Object.keys(this.rules) as TableName[],
      ReadonlyArray.findFirst(
        (tableName) => !!this.db.normalizeId(tableName, id)
      )
    );
  }

  predicate<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>
  ): Effect.Effect<never, never, boolean> {
    return pipe(
      this.rules[tableName]?.read,
      Option.fromNullable,
      Option.match({
        onSome: (rule) => rule(this.ctx, doc),
        onNone: () => Effect.succeed(true),
      })
    );
  }

  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<never, never, Option.Option<any>> {
    return pipe(
      Effect.promise(() => this.db.get(id)),
      Effect.flatMap((nullableDoc) =>
        pipe(
          nullableDoc,
          Option.fromNullable,
          Option.match({
            onSome: (doc) =>
              pipe(
                this.tableName(id),
                Option.match({
                  onSome: (tableName) =>
                    pipe(
                      this.predicate(tableName, doc),
                      Effect.if({
                        onTrue: Effect.succeed(Option.some(doc)),
                        onFalse: Effect.succeed(Option.none()),
                      })
                    ),
                  onNone: () => Effect.succeed(Option.none()),
                })
              ),
            onNone: () => Effect.succeed(Option.none()),
          })
        )
      )
    );
  }

  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>> {
    return new WrapQueryInitializer(this.db.query(tableName), (doc) =>
      this.predicate(tableName, doc)
    );
  }
}

class ModifyNotAllowedError {
  readonly _tag = "ModifyNotAllowedError";
}

class InsertNotAllowedError {
  readonly _tag = "InsertNotAllowedError";
}

interface EffectDatabaseWriter<DataModel extends GenericDataModel> {
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>>;
  insert<TableName extends string>(
    table: TableName,
    value: any
  ): Effect.Effect<never, never, any>;
  patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<any>
  ): Effect.Effect<never, never, void>;
  replace<TableName extends string>(
    id: GenericId<TableName>,
    value: any
  ): Effect.Effect<never, never, void>;
  delete(id: GenericId<string>): Effect.Effect<never, never, void>;
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<never, never, Option.Option<any>>;
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<NamedTableInfo<DataModel, TableName>>;
}

class WrapWriter<Ctx, DataModel extends GenericDataModel>
  implements EffectDatabaseWriter<DataModel>
{
  ctx: Ctx;
  db: GenericDatabaseWriter<DataModel>;
  reader: EffectDatabaseReader<DataModel>;
  rules: Rules<Ctx, DataModel>;

  modifyPredicate<T extends GenericTableInfo>(
    tableName: string,
    doc: DocumentByInfo<T>
  ): Effect.Effect<never, never, boolean> {
    return pipe(
      this.rules[tableName]?.modify,
      Option.fromNullable,
      Option.match({
        onSome: (rule) => rule(this.ctx, doc),
        onNone: () => Effect.succeed(true),
      })
    );
  }

  constructor(
    ctx: Ctx,
    db: GenericDatabaseWriter<DataModel>,
    rules: Rules<Ctx, DataModel>
  ) {
    this.ctx = ctx;
    this.db = db;
    this.reader = new WrapReader(ctx, db, rules);
    this.rules = rules;
  }
  normalizeId<TableName extends TableNamesInDataModel<DataModel>>(
    tableName: TableName,
    id: string
  ): Option.Option<GenericId<TableName>> {
    return Option.fromNullable(this.db.normalizeId(tableName, id));
  }
  insert<TableName extends string>(
    table: TableName,
    value: any
  ): Effect.Effect<never, never, any> {
    const doInsert = Effect.promise(() => this.db.insert(table, value));

    return pipe(
      this.rules[table]?.insert,
      Option.fromNullable,
      Option.match({
        onSome: (rule) =>
          pipe(
            rule(this.ctx, value),
            Effect.if({
              onTrue: doInsert,
              onFalse: Effect.fail(new InsertNotAllowedError()),
            })
          ),
        onNone: () => doInsert,
      }),
      Effect.orDie
    );
  }
  tableName<TableName extends string>(
    id: GenericId<TableName>
  ): Option.Option<TableName> {
    return this.reader.tableName(id);
  }
  checkModifyAuth<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<never, never, void> {
    // Note all writes already do a `db.get` internally, so this isn't
    // an extra read; it's just populating the cache earlier.
    // Since we call `this.get`, read access controls apply and this may return
    // null even if the document exists.
    return pipe(
      this.get(id),
      Effect.flatMap((optionDoc) =>
        pipe(
          optionDoc,
          Option.match({
            onSome: (doc) =>
              pipe(
                this.tableName(id),
                Option.match({
                  onSome: (tableName) =>
                    pipe(
                      this.modifyPredicate(tableName, doc),
                      Effect.if({
                        onTrue: Effect.unit,
                        onFalse: Effect.fail(
                          new Error("write access not allowed")
                        ),
                      })
                    ),
                  onNone: () => Effect.unit,
                })
              ),
            onNone: () =>
              Effect.fail(new Error("no read access or doc does not exist")),
          })
        )
      ),
      Effect.orDie
    );
  }
  patch<TableName extends string>(
    id: GenericId<TableName>,
    value: Partial<any>
  ): Effect.Effect<never, never, void> {
    return pipe(
      this.checkModifyAuth(id),
      Effect.flatMap(() => Effect.promise(() => this.db.patch(id, value)))
    );
  }
  replace<TableName extends string>(
    id: GenericId<TableName>,
    value: any
  ): Effect.Effect<never, never, void> {
    return pipe(
      this.checkModifyAuth(id),
      Effect.flatMap(() => Effect.promise(() => this.db.replace(id, value)))
    );
  }
  delete(id: GenericId<string>): Effect.Effect<never, never, void> {
    return pipe(
      this.checkModifyAuth(id),
      Effect.flatMap(() => Effect.promise(() => this.db.delete(id)))
    );
  }
  get<TableName extends string>(
    id: GenericId<TableName>
  ): Effect.Effect<never, never, Option.Option<any>> {
    return this.reader.get(id);
  }
  query<TableName extends string>(
    tableName: TableName
  ): EffectQueryInitializer<any> {
    return this.reader.query(tableName);
  }
}
