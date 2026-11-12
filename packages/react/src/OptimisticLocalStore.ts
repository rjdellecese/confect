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
import type { PaginatedQueryArgs, PaginatedQueryItem } from "./index";

/**
 * The Confect counterpart to Convex's `OptimisticLocalStore`.
 *
 * Its methods accept Confect query `Ref`s and operate on decoded (Effect
 * Schema) values rather than the encoded values stored by Convex. Query values
 * are wrapped in `Option`: `Option.none()` represents a query that is not
 * present in the store, and `Option.some(value)` carries the decoded value.
 */
export interface OptimisticLocalStore {
  getQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    ...args: Ref.OptionalArgs<Query>
  ): Option.Option<Ref.Returns<Query>>;

  getAllQueries<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
  ): Array<QueryEntry<Query>>;

  setQuery<Query extends Ref.AnyPublicQuery>(
    queryRef: Query,
    args: Ref.Args<Query>,
    value: Option.Option<Ref.Returns<Query>>,
  ): void;
}

/**
 * Wraps Convex's `OptimisticLocalStore` so that it accepts Confect query `Ref`s
 * and decoded values, handling the encoding/decoding against Convex's store.
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

interface QueryEntry<Query extends Ref.AnyPublicQuery> {
  args: Ref.Args<Query>;
  value: Option.Option<Ref.Returns<Query>>;
}

interface LoadedPage<Query extends Ref.AnyPublicPaginatedQuery> {
  readonly args: Ref.Args<Query>;
  readonly value: Ref.Returns<Query>;
}

interface InsertOptions<Query extends Ref.AnyPublicPaginatedQuery> {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  localQueryStore: OptimisticLocalStore;
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
 */
export const insertAtPosition = <Query extends Ref.AnyPublicPaginatedQuery>({
  paginatedQuery,
  argsToMatch,
  localQueryStore,
  item,
  sortKeyFromItem,
  sortOrder,
}: InsertOptions<Query> & {
  sortOrder: "asc" | "desc";
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
