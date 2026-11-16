import { Ref } from "@confect/core";
import type { OptimisticLocalStore as ConvexOptimisticLocalStore } from "convex/browser";
import { compareValues, convexToJson, type Value } from "convex/values";
import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as Record from "effect/Record";
import type * as Order from "effect/Order";
import { pipe } from "effect/Function";
import type {
  PaginatedArgs as PaginatedQueryArgs,
  PaginatedItem as PaginatedQueryItem,
} from "@confect/core/Ref";

/**
 * The Confect counterpart to Convex's `OptimisticLocalStore`.
 *
 * Its methods accept Confect query `Ref`s and operate on decoded (Effect
 * Schema) values rather than the encoded values stored by Convex. Query values
 * are wrapped in `Option`: `Option.none()` represents a query that is not
 * present in the store, and `Option.some(value)` carries the decoded value. Use
 * this store only inside the synchronous optimistic callback. Treat read values
 * as immutable and write replacement values with `setQuery`.
 */
export interface OptimisticLocalStore {
  /**
   * Reads one cached query, encoding decoded `args` to identify its cache
   * entry.
   *
   * @param queryRef - The public query ref to read.
   * @param args - Decoded arguments; omit them only for an argument-free ref.
   *
   * @returns `Some` of the decoded result, or `None` when no value is cached
   *   (including a query that is still loading).
   *
   * @throws When argument encoding or cached-result decoding fails.
   */
  getQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Option.Option<Ref.Returns<Query>>;

  /**
   * Reads all cached argument variants of `queryRef`, including loading
   * entries.
   *
   * @returns Entries with decoded `args` and an optional decoded `value`. An
   *   empty array means no matching queries are in the local store.
   *
   * @throws When cached argument or result decoding fails.
   */
  getAllQueries<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
  ): Array<QueryEntry<Query>>;

  /**
   * Temporarily replaces a query's cached value; it does not write to the
   * backend.
   *
   * @param queryRef - The public query ref to update.
   * @param args - Decoded arguments identifying the entry, including `{}` for
   *   an argument-free query.
   * @param value - `Some` of a replacement decoded result, or `None` to remove
   *   the cached value and expose a loading state until Convex supplies a
   *   result.
   *
   * @returns Nothing; Convex manages rollback with the optimistic mutation.
   *
   * @throws When argument or result encoding fails.
   */
  setQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    args: Ref.Args<Query>,
    value: Option.Option<Ref.Returns<Query>>,
  ): void;
}

/**
 * Wraps Convex's `OptimisticLocalStore` so that it accepts Confect query `Ref`s
 * and decoded values, handling the encoding/decoding against Convex's store.
 *
 * @internal
 */
export const make = (
  convexLocalStore: ConvexOptimisticLocalStore,
): OptimisticLocalStore => ({
  getQuery: (queryRef, ...rest) => {
    const functionReference = Ref.getFunctionReference(queryRef);
    const args = (rest[0] ?? {}) as Ref.Args<typeof queryRef>;
    const encodedArgs = Ref.encodeArgsSync(queryRef, args);
    const encoded = convexLocalStore.getQuery(functionReference, encodedArgs);
    return encoded === undefined
      ? Option.none()
      : Option.some(Ref.decodeReturnsSync(queryRef, encoded));
  },
  getAllQueries: (queryRef) => {
    const functionReference = Ref.getFunctionReference(queryRef);
    return Array.map(
      convexLocalStore.getAllQueries(functionReference),
      ({ args, value }) => ({
        args: Ref.decodeArgsSync(queryRef, args),
        value:
          value === undefined
            ? Option.none()
            : Option.some(Ref.decodeReturnsSync(queryRef, value)),
      }),
    );
  },
  setQuery: (queryRef, args, value) => {
    const functionReference = Ref.getFunctionReference(queryRef);
    const encodedArgs = Ref.encodeArgsSync(queryRef, args);
    const encodedValue = Option.match(value, {
      onNone: () => undefined,
      onSome: (decoded) => Ref.encodeReturnsSync(queryRef, decoded),
    });
    convexLocalStore.setQuery(functionReference, encodedArgs, encodedValue);
  },
});

/**
 * A cached argument variant returned by `OptimisticLocalStore.getAllQueries`.
 */
interface QueryEntry<Query extends Ref.AnyPublicQuery> {
  /**
   * Decoded query arguments, including pagination options for a page query.
   */
  args: Ref.Args<Query>;
  /**
   * The decoded cached result, or `None` while the entry has no loaded value.
   */
  value: Option.Option<Ref.Returns<Query>>;
}

interface LoadedPage<Query extends Ref.AnyPublicPaginatedQuery> {
  readonly args: Ref.Args<Query>;
  readonly value: Ref.Returns<Query>;
}

/**
 * Decoded inputs shared by the optimistic paginated insertion helpers.
 */
interface InsertOptions<Query extends Ref.AnyPublicPaginatedQuery> {
  /**
   * The public paginated query whose cached pages should be edited.
   */
  paginatedQuery: Query;
  /**
   * A subset of decoded user arguments to match, excluding `paginationOpts`.
   * Omit to consider every argument variant. Comparison uses encoded Convex
   * values, so decoded objects need not have the same identity.
   */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  /**
   * The store supplied to the mutation's synchronous optimistic callback.
   */
  localQueryStore: OptimisticLocalStore;
  /**
   * The decoded item to insert; helpers encode the updated page for the cache.
   */
  item: PaginatedQueryItem<Query>;
}

class QueryArgsEncodingError extends Schema.TaggedError<
  QueryArgsEncodingError,
  { readonly brand: unique symbol }
>()("QueryArgsEncodingError", {
  queryName: Schema.String,
  args: Schema.Unknown,
  cause: Schema.Defect(),
}) {}

const Json = Schema.fromJsonString(Schema.Unknown);

const serializedUserArgs = <Query extends Ref.AnyPublicPaginatedQuery>(
  query: Query,
  args: unknown,
): Result.Result<string, QueryArgsEncodingError> =>
  Result.try(() =>
    convexToJson(
      Ref.encodePaginatedQueryArgsSync(
        query,
        args as Omit<Ref.Args<Query>, "paginationOpts">,
      ) as Value,
    ),
  ).pipe(
    Result.flatMap(Schema.encodeResult(Json)),
    Result.mapError((cause) =>
      QueryArgsEncodingError.make({
        queryName: Ref.getConvexFunctionName(query),
        args,
        cause,
      }),
    ),
  );

const loadedPage = <Query extends Ref.AnyPublicPaginatedQuery>(
  entry: QueryEntry<Query>,
): Option.Option<LoadedPage<Query>> =>
  Option.map(entry.value, (value) => ({ args: entry.args, value }));

const keyedPages = <Query extends Ref.AnyPublicPaginatedQuery>(
  query: Query,
  entries: ReadonlyArray<QueryEntry<Query>>,
) =>
  Result.all(
    Array.map(
      Array.getSomes(Array.map(entries, loadedPage<Query>)),
      (entry) => {
        const { paginationOpts: _, ...args } = entry.args;
        return serializedUserArgs(query, args).pipe(
          Result.map((key) => ({ ...entry, key })),
        );
      },
    ),
  );

const matchingPages = <Query extends Ref.AnyPublicPaginatedQuery>(
  query: Query,
  entries: ReadonlyArray<QueryEntry<Query>>,
  argsToMatch: Partial<PaginatedQueryArgs<Query>> | undefined,
): Result.Result<ReadonlyArray<QueryEntry<Query>>, QueryArgsEncodingError> =>
  argsToMatch === undefined
    ? Result.succeed(entries)
    : Result.all(
        Array.map(entries, (entry) =>
          Result.gen(function* () {
            const { paginationOpts: _, ...args } = entry.args;
            const actual = yield* serializedUserArgs(query, args);
            const expected = yield* serializedUserArgs(query, {
              ...args,
              ...argsToMatch,
            });
            return actual === expected ? Option.some(entry) : Option.none();
          }),
        ),
      ).pipe(Result.map(Array.getSomes));

const writePages = <Query extends Ref.AnyPublicPaginatedQuery>(
  store: OptimisticLocalStore,
  query: Query,
  updates: Result.Result<
    ReadonlyArray<LoadedPage<Query>>,
    QueryArgsEncodingError
  >,
): void =>
  Array.forEach(
    Result.getOrThrowWith(updates, (error) => error.cause),
    ({ args, value }) => store.setQuery(query, args, Option.some(value)),
  );

/**
 * Updates every loaded page matching the query ref and decoded user arguments.
 * The callback receives and returns decoded items, not Convex wire values.
 *
 * @param localStore - The mutation callback's optimistic store.
 * @param query - The public paginated query ref.
 * @param args - All decoded user arguments, excluding `paginationOpts`.
 *   Matching compares encoded values, not decoded object identities.
 * @param updateValue - Synchronously returns a replacement for each loaded
 *   item. Return the current item to leave it unchanged; do not mutate it.
 *
 * @returns Nothing; writes replacement pages to the local store. Missing or
 *   loading entries are ignored and no backend write is performed.
 *
 * @throws When a codec, argument serialization, store operation, or callback
 *   fails.
 */
export const optimisticallyUpdateValueInPaginatedQuery = <
  Query extends Ref.AnyPublicPaginatedQuery,
>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  updateValue: (
    currentValue: PaginatedQueryItem<Query>,
  ) => PaginatedQueryItem<Query>,
): void =>
  writePages(
    localStore,
    query,
    Result.gen(function* () {
      const expected = yield* serializedUserArgs(query, args);
      const pages = yield* keyedPages(query, localStore.getAllQueries(query));
      return Array.map(
        Array.filter(pages, ({ key }) => key === expected),
        ({ args: pageArgs, value }) => ({
          args: pageArgs,
          value: { ...value, page: Array.map(value.page, updateValue) },
        }),
      );
    }),
  );

/**
 * Prepends a decoded item to the first matching initial page, if loaded.
 * `argsToMatch` contains decoded user arguments and may omit fields.
 *
 * @param options - The query, optional argument filter, callback store, and
 *   decoded item. An initial page has `paginationOpts.cursor === null`.
 *
 * @returns Nothing. Updates at most one page, even if multiple pagination
 *   instances match; does nothing if the first matching initial page is
 *   unloaded.
 *
 * @throws When argument matching, a codec, or a store operation fails.
 */
export const insertAtTop = <Query extends Ref.AnyPublicPaginatedQuery>({
  paginatedQuery,
  argsToMatch,
  localQueryStore,
  item,
}: InsertOptions<Query>): void =>
  writePages(
    localQueryStore,
    paginatedQuery,
    matchingPages(
      paginatedQuery,
      localQueryStore.getAllQueries(paginatedQuery),
      argsToMatch,
    ).pipe(
      Result.map((pages) =>
        Array.findFirst(
          pages,
          ({ args }) => args.paginationOpts.cursor === null,
        ).pipe(
          Option.flatMap(loadedPage<Query>),
          Option.map(({ args, value }) => ({
            args,
            value: { ...value, page: Array.prepend(value.page, item) },
          })),
          Option.toArray,
        ),
      ),
    ),
  );

/**
 * Appends a decoded item to the first matching completed page, if loaded.
 * `argsToMatch` contains decoded user arguments and may omit fields.
 *
 * @param options - The query, optional argument filter, callback store, and
 *   decoded item. A completed page has `isDone === true`.
 *
 * @returns Nothing. Updates at most one page; does nothing if no loaded,
 *   matching page reaches the end of the query.
 *
 * @throws When argument matching, a codec, or a store operation fails.
 */
export const insertAtBottomIfLoaded = <
  Query extends Ref.AnyPublicPaginatedQuery,
>({
  paginatedQuery,
  argsToMatch,
  localQueryStore,
  item,
}: InsertOptions<Query>): void =>
  writePages(
    localQueryStore,
    paginatedQuery,
    matchingPages(
      paginatedQuery,
      localQueryStore.getAllQueries(paginatedQuery),
      argsToMatch,
    ).pipe(
      Result.map((pages) =>
        pipe(
          Array.getSomes(Array.map(pages, loadedPage<Query>)),
          Array.findFirst(({ value }) => value.isDone),
          Option.map(({ args, value }) => ({
            args,
            value: { ...value, page: Array.append(value.page, item) },
          })),
          Option.toArray,
        ),
      ),
    ),
  );

const convexOrder: Order.Order<Value> = (left, right) => {
  const ordering = compareValues(left, right);
  return ordering < 0 ? -1 : ordering > 0 ? 1 : 0;
};

const insertInPages = <Query extends Ref.AnyPublicPaginatedQuery>(
  pages: ReadonlyArray<LoadedPage<Query>>,
  item: PaginatedQueryItem<Query>,
  order: Order.Order<PaginatedQueryItem<Query>>,
): Option.Option<LoadedPage<Query>> =>
  Option.gen(function* () {
    const sorted = pipe(
      Array.map(pages, (entry) =>
        Option.map(Array.head(entry.value.page), (firstItem) => ({
          ...entry,
          firstItem,
        })),
      ),
      Array.getSomes,
      Array.sort(
        (
          left: LoadedPage<Query> & {
            readonly firstItem: PaginatedQueryItem<Query>;
          },
          right,
        ) => order(left.firstItem, right.firstItem),
      ),
    );
    const first = yield* Array.head(sorted);
    if (order(item, first.firstItem) <= 0) {
      return yield* Option.some(first).pipe(
        Option.filter(({ args }) => args.paginationOpts.cursor === null),
        Option.map(({ args, value }) => ({
          args,
          value: { ...value, page: Array.prepend(value.page, item) },
        })),
      );
    }
    const last = yield* Array.last(sorted);
    const lastItem = yield* Array.last(last.value.page);
    if (order(item, lastItem) >= 0) {
      return yield* Option.some(last).pipe(
        Option.filter(({ value }) => value.isDone),
        Option.map(({ args, value }) => ({
          args,
          value: { ...value, page: Array.append(value.page, item) },
        })),
      );
    }
    const target = yield* Array.findFirstIndex(
      sorted,
      (entry) => order(entry.firstItem, item) > 0,
    ).pipe(
      Option.match({
        onNone: () => Option.some(last),
        onSome: (index) => Array.get(sorted, index - 1),
      }),
    );
    const index = Array.findFirstIndex(
      target.value.page,
      (current) => order(current, item) >= 0,
    ).pipe(Option.getOrElse(() => target.value.page.length));
    const page = yield* Array.insertAt(target.value.page, index, item);
    return { args: target.args, value: { ...target.value, page } };
  });

/**
 * Inserts a decoded item into each matching pagination instance using Convex's
 * value ordering. The sort key callback receives decoded items and must return
 * Convex values whose ordering matches the server query. Empty or unloaded
 * pages are skipped; insertion beyond a loaded boundary requires the first or
 * completed last page respectively.
 *
 * @param options - The query, optional argument filter, callback store, decoded
 *   item, sort direction, and key callback. Pagination instances are grouped by
 *   encoded user arguments and `paginationOpts.id`.
 *
 * @returns Nothing; updates at most one loaded page per matching instance.
 *
 * @throws When argument matching, a codec, store operation, or sort callback
 *   fails.
 */
export const insertAtPosition = <Query extends Ref.AnyPublicPaginatedQuery>({
  paginatedQuery,
  argsToMatch,
  localQueryStore,
  item,
  sortKeyFromItem,
  sortOrder,
}: InsertOptions<Query> & {
  /**
   * The server query's sort direction; applied to the Convex sort-key ordering.
   */
  sortOrder: "asc" | "desc";
  /**
   * Computes a Convex-compatible key from a decoded item. Arrays act as
   * composite keys. Match the server's ordering, including tie-breakers, and
   * return wire-compatible values rather than decoded objects such as `Date`.
   * The callback may run repeatedly and must not mutate its item.
   */
  sortKeyFromItem: (item: PaginatedQueryItem<Query>) => Value | Value[];
}): void =>
  writePages(
    localQueryStore,
    paginatedQuery,
    matchingPages(
      paginatedQuery,
      localQueryStore.getAllQueries(paginatedQuery),
      argsToMatch,
    ).pipe(
      Result.flatMap((entries) =>
        keyedPages(
          paginatedQuery,
          Array.filter(entries, (entry) =>
            Option.exists(entry.value, (value) =>
              Array.isArrayNonEmpty(value.page),
            ),
          ),
        ),
      ),
      Result.map((pages) =>
        pipe(
          pages,
          Array.groupBy(
            ({ args, key }) => `${key}:${args.paginationOpts.id ?? ""}`,
          ),
          Record.values,
          Array.map((group) =>
            insertInPages(group, item, (left, right) =>
              sortOrder === "asc"
                ? convexOrder(sortKeyFromItem(left), sortKeyFromItem(right))
                : convexOrder(sortKeyFromItem(right), sortKeyFromItem(left)),
            ),
          ),
          Array.getSomes,
        ),
      ),
    ),
  );
