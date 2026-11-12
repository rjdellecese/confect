import { Ref } from "@confect/core";
import type { RuntimeAndFunctionType } from "@confect/core";
import type { OptimisticLocalStore as ConvexOptimisticLocalStore } from "convex/browser";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { compareValues, convexToJson, type Value } from "convex/values";
import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as Schema from "effect/Schema";
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
  ): Array<{
    args: Ref.Args<Query>;
    value: Option.Option<Ref.Returns<Query>>;
  }>;

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

type PaginatedQuery = Ref.Ref<
  RuntimeAndFunctionType.AnyQuery,
  "public",
  { paginationOpts: PaginationOptions & { id?: number } },
  PaginationResult<unknown>,
  unknown
>;

const encodeJson = Schema.Unknown.pipe(
  Schema.fromJsonString,
  Schema.encodeSync,
);

const serializedUserArgs = <Query extends PaginatedQuery>(
  query: Query,
  args: unknown,
): string =>
  encodeJson(
    convexToJson(
      Ref.encodePaginatedQueryArgsSync(
        query,
        args as Omit<Ref.Args<Query>, "paginationOpts">,
      ) as Value,
    ),
  );

/**
 * Updates every loaded page matching the query ref and decoded user arguments.
 * The callback receives and returns decoded items, not Convex wire values.
 */
export const optimisticallyUpdateValueInPaginatedQuery = <
  Query extends PaginatedQuery,
>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: PaginatedQueryArgs<Query>,
  updateValue: (
    currentValue: PaginatedQueryItem<Query>,
  ) => PaginatedQueryItem<Query>,
): void => {
  const expectedArgs = serializedUserArgs(query, args);
  for (const entry of localStore.getAllQueries(query)) {
    if (Option.isNone(entry.value)) continue;
    const { paginationOpts: _, ...userArgs } = entry.args;
    if (serializedUserArgs(query, userArgs) !== expectedArgs) continue;
    localStore.setQuery(
      query,
      entry.args,
      Option.some({
        ...entry.value.value,
        page: Array.map(entry.value.value.page, updateValue),
      }),
    );
  }
};

interface InsertOptions<Query extends PaginatedQuery> {
  paginatedQuery: Query;
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>;
  localQueryStore: OptimisticLocalStore;
  item: PaginatedQueryItem<Query>;
}

const matchingPages = <Query extends PaginatedQuery>({
  paginatedQuery,
  argsToMatch,
  localQueryStore,
}: InsertOptions<Query>) =>
  Array.filter(localQueryStore.getAllQueries(paginatedQuery), ({ args }) => {
    if (argsToMatch === undefined) return true;
    const { paginationOpts: _, ...userArgs } = args;
    return (
      serializedUserArgs(paginatedQuery, userArgs) ===
      serializedUserArgs(paginatedQuery, { ...userArgs, ...argsToMatch })
    );
  });

/**
 * Prepends a decoded item to the first matching initial page, if loaded.
 * `argsToMatch` contains decoded user arguments and may omit fields.
 */
export const insertAtTop = <Query extends PaginatedQuery>(
  options: InsertOptions<Query>,
): void => {
  const first = Option.getOrUndefined(
    Array.findFirst(
      matchingPages(options),
      ({ args }) => args.paginationOpts.cursor === null,
    ),
  );
  if (first === undefined || Option.isNone(first.value)) return;
  options.localQueryStore.setQuery(
    options.paginatedQuery,
    first.args,
    Option.some({
      ...first.value.value,
      page: [options.item, ...first.value.value.page],
    }),
  );
};

/**
 * Appends a decoded item to the first matching completed page, if loaded.
 * `argsToMatch` contains decoded user arguments and may omit fields.
 */
export const insertAtBottomIfLoaded = <Query extends PaginatedQuery>(
  options: InsertOptions<Query>,
): void => {
  const last = Option.getOrUndefined(
    Array.findFirst(
      matchingPages(options),
      ({ value }) => Option.isSome(value) && value.value.isDone,
    ),
  );
  if (last === undefined || Option.isNone(last.value)) return;
  options.localQueryStore.setQuery(
    options.paginatedQuery,
    last.args,
    Option.some({
      ...last.value.value,
      page: [...last.value.value.page, options.item],
    }),
  );
};

/**
 * Inserts a decoded item into each matching pagination instance using Convex's
 * value ordering. The sort key callback receives decoded items and must return
 * Convex values whose ordering matches the server query. Empty or unloaded
 * pages are skipped; insertion beyond a loaded boundary requires the first or
 * completed last page respectively.
 */
export const insertAtPosition = <Query extends PaginatedQuery>(
  options: InsertOptions<Query> & {
    sortOrder: "asc" | "desc";
    sortKeyFromItem: (item: PaginatedQueryItem<Query>) => Value | Value[];
  },
): void => {
  const { paginatedQuery, localQueryStore, item, sortKeyFromItem, sortOrder } =
    options;
  const groups = new Map<
    string,
    Array<{ args: Ref.Args<Query>; value: Ref.Returns<Query> }>
  >();
  for (const entry of matchingPages(options)) {
    if (Option.isNone(entry.value) || entry.value.value.page.length === 0)
      continue;
    const { paginationOpts, ...userArgs } = entry.args;
    const key = encodeJson({
      args: serializedUserArgs(paginatedQuery, userArgs),
      id: paginationOpts.id ?? null,
    });
    const group = groups.get(key) ?? [];
    group.push({ args: entry.args, value: entry.value.value });
    groups.set(key, group);
  }
  const compare = (
    a: PaginatedQueryItem<Query>,
    b: PaginatedQueryItem<Query>,
  ): -1 | 0 | 1 => {
    const order =
      sortOrder === "asc"
        ? compareValues(sortKeyFromItem(a), sortKeyFromItem(b))
        : compareValues(sortKeyFromItem(b), sortKeyFromItem(a));
    return order < 0 ? -1 : order > 0 ? 1 : 0;
  };
  for (const group of groups.values()) {
    const pages = Array.sort(
      group,
      (a: { args: Ref.Args<Query>; value: Ref.Returns<Query> }, b) =>
        compare(a.value.page[0], b.value.page[0]),
    );
    const first = pages[0];
    const last = pages[pages.length - 1];
    if (first === undefined || last === undefined) continue;
    if (compare(item, first.value.page[0]) <= 0) {
      if (first.args.paginationOpts.cursor === null) {
        localQueryStore.setQuery(
          paginatedQuery,
          first.args,
          Option.some({
            ...first.value,
            page: [item, ...first.value.page],
          }),
        );
      }
      continue;
    }
    if (compare(item, last.value.page[last.value.page.length - 1]) >= 0) {
      if (last.value.isDone) {
        localQueryStore.setQuery(
          paginatedQuery,
          last.args,
          Option.some({
            ...last.value,
            page: [...last.value.page, item],
          }),
        );
      }
      continue;
    }
    const successor = Array.findFirstIndex(
      pages,
      ({ value }) => compare(value.page[0], item) > 0,
    );
    const target = Option.isNone(successor) ? last : pages[successor.value - 1];
    if (target === undefined) continue;
    const index = Array.findFirstIndex(
      target.value.page,
      (current: PaginatedQueryItem<Query>) => compare(current, item) >= 0,
    );
    const page = Option.isNone(index)
      ? [...target.value.page, item]
      : [
          ...target.value.page.slice(0, index.value),
          item,
          ...target.value.page.slice(index.value),
        ];
    localQueryStore.setQuery(
      paginatedQuery,
      target.args,
      Option.some({ ...target.value, page }),
    );
  }
};
