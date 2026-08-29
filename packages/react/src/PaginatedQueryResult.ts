import * as Equal from "effect/Equal";
import * as Function from "effect/Function";
import * as Hash from "effect/Hash";
import * as Match from "effect/Match";
import * as Pipeable from "effect/Pipeable";
import * as Predicate from "effect/Predicate";

const TypeId = "~@confect/react/PaginatedQueryResult";
type TypeId = typeof TypeId;

/**
 * A `PaginatedQueryResult` represents the result of a Confect paginated query.
 * The non-`Failure` variants mirror the statuses of `usePaginatedQuery` from
 * `convex/react` and all carry `results` and `isLoading`, so the common UI
 * shape — render the list, show a spinner while loading — needs only an
 * {@link isFailure} early-out and plain field access.
 *
 * Every variant carries `results`, including `Failure`: when a later page
 * fails, the pages already loaded are still worth rendering alongside the
 * error, so they are not discarded. `Failure` additionally carries the
 * query's decoded typed error.
 *
 * `loadMore` appears only on `CanLoadMore`, the one state it can make
 * progress from. The underlying Convex hook exposes it on every status, but
 * calling it while a page is in flight, once the list is exhausted, or after
 * a failure is an intentional no-op there; narrowing to `CanLoadMore` — via
 * {@link isCanLoadMore} or {@link match} — makes that statically apparent
 * instead of silently dropping the call.
 *
 * When the query declares no `error` schema (`E` is `never`), the `Failure`
 * variant is excluded from the type entirely, so `isLoading` is accessible
 * without any narrowing.
 *
 * @typeParam Item - The type of a decoded page item.
 * @typeParam E - The type of the decoded typed error in the `Failure` variant.
 */
export type PaginatedQueryResult<Item, E = never> = [E] extends [never]
  ?
      | LoadingFirstPage<Item, E>
      | LoadingMore<Item, E>
      | CanLoadMore<Item, E>
      | Exhausted<Item, E>
  :
      | LoadingFirstPage<Item, E>
      | LoadingMore<Item, E>
      | CanLoadMore<Item, E>
      | Exhausted<Item, E>
      | Failure<Item, E>;

/**
 * Every variant regardless of `E` — the parameter type for guards and
 * {@link match}, since `PaginatedQueryResult` itself excludes `Failure` when
 * `E` is `never`.
 */
export type Variants<Item, E = never> =
  | LoadingFirstPage<Item, E>
  | LoadingMore<Item, E>
  | CanLoadMore<Item, E>
  | Exhausted<Item, E>
  | Failure<Item, E>;

export declare namespace PaginatedQueryResult {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface Proto<out Item, out E> extends Pipeable.Pipeable {
    readonly [TypeId]: TypeId;
    readonly "~Item": Item;
    readonly "~E": E;
  }

  export type Item<R> = R extends { readonly "~Item": infer Item_ }
    ? Item_
    : never;

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Failure<R> = R extends { readonly "~E": infer E } ? E : never;
}

export interface LoadingFirstPage<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  readonly _tag: "LoadingFirstPage";
  readonly skipped: boolean;
  readonly results: ReadonlyArray<Item>;
  readonly isLoading: true;
}

export interface LoadingMore<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  readonly _tag: "LoadingMore";
  readonly results: ReadonlyArray<Item>;
  readonly isLoading: true;
}

export interface CanLoadMore<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  readonly _tag: "CanLoadMore";
  readonly results: ReadonlyArray<Item>;
  readonly isLoading: false;
  readonly loadMore: (numItems: number) => void;
}

export interface Exhausted<Item, E = never> extends PaginatedQueryResult.Proto<
  Item,
  E
> {
  readonly _tag: "Exhausted";
  readonly results: ReadonlyArray<Item>;
  readonly isLoading: false;
}

export interface Failure<Item, E = never> extends PaginatedQueryResult.Proto<
  Item,
  E
> {
  readonly _tag: "Failure";
  readonly error: E;
  /** The pages loaded before the failure. */
  readonly results: ReadonlyArray<Item>;
}

export const isPaginatedQueryResult = (
  u: unknown,
): u is Variants<unknown, unknown> => Predicate.hasProperty(u, TypeId);

const PaginatedQueryResultProto = {
  [TypeId]: TypeId,
  pipe(this: Variants<any, any>, ...args: ReadonlyArray<unknown>) {
    return Pipeable.pipeArguments(
      this,
      args as unknown as Parameters<typeof Pipeable.pipeArguments>[1],
    );
  },
  /**
   * `CanLoadMore`'s `loadMore` is excluded from equality and hashing, like
   * function fields generally: two results that render identically are equal
   * even though their callbacks differ by identity.
   */
  [Equal.symbol](this: Variants<any, any>, that: Variants<any, any>): boolean {
    if (this._tag !== that._tag) {
      return false;
    }
    return Match.value(this).pipe(
      Match.tag(
        "LoadingFirstPage",
        (self) => self.skipped === (that as LoadingFirstPage<any, any>).skipped,
      ),
      Match.tag("LoadingMore", "CanLoadMore", "Exhausted", (self) =>
        Equal.equals(self.results, that.results),
      ),
      Match.tag(
        "Failure",
        (self) =>
          Equal.equals(self.error, (that as Failure<any, any>).error) &&
          Equal.equals(self.results, (that as Failure<any, any>).results),
      ),
      Match.exhaustive,
    );
  },
  [Hash.symbol](this: Variants<any, any>): number {
    const tagHash = Hash.string(this._tag);
    return Match.value(this).pipe(
      Match.tag("LoadingFirstPage", (self) =>
        Hash.combine(tagHash)(Hash.hash(self.skipped)),
      ),
      Match.tag("LoadingMore", "CanLoadMore", "Exhausted", (self) =>
        Hash.combine(tagHash)(Hash.hash(self.results)),
      ),
      Match.tag("Failure", (self) =>
        Hash.combine(tagHash)(
          Hash.combine(Hash.hash(self.error))(Hash.hash(self.results)),
        ),
      ),
      Match.exhaustive,
    );
  },
};

const noResults: ReadonlyArray<never> = [];

export const loadingFirstPage = <Item = never, E = never>(options: {
  skipped: boolean;
}): LoadingFirstPage<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "LoadingFirstPage" as const,
    skipped: options.skipped,
    results: noResults,
    isLoading: true as const,
  });

export const loadingMore = <Item, E = never>(options: {
  results: ReadonlyArray<Item>;
}): LoadingMore<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "LoadingMore" as const,
    results: options.results,
    isLoading: true as const,
  });

export const canLoadMore = <Item, E = never>(options: {
  results: ReadonlyArray<Item>;
  loadMore: (numItems: number) => void;
}): CanLoadMore<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "CanLoadMore" as const,
    results: options.results,
    isLoading: false as const,
    loadMore: options.loadMore,
  });

export const exhausted = <Item, E = never>(options: {
  results: ReadonlyArray<Item>;
}): Exhausted<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "Exhausted" as const,
    results: options.results,
    isLoading: false as const,
  });

export const failure = <E, Item = never>(options: {
  error: E;
  results: ReadonlyArray<Item>;
}): Failure<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "Failure" as const,
    error: options.error,
    results: options.results,
  });

export const isLoadingFirstPage = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingFirstPage<Item, E> => result._tag === "LoadingFirstPage";

export const isLoadingMore = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingMore<Item, E> => result._tag === "LoadingMore";

export const isCanLoadMore = <Item, E>(
  result: Variants<Item, E>,
): result is CanLoadMore<Item, E> => result._tag === "CanLoadMore";

export const isExhausted = <Item, E>(
  result: Variants<Item, E>,
): result is Exhausted<Item, E> => result._tag === "Exhausted";

export const isFailure = <Item, E>(
  result: Variants<Item, E>,
): result is Failure<Item, E> => result._tag === "Failure";

export const isLoading = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingFirstPage<Item, E> | LoadingMore<Item, E> =>
  result._tag === "LoadingFirstPage" || result._tag === "LoadingMore";

type MatchOptions<Item, E, V, W, X, Y, Z> = {
  readonly onLoadingFirstPage: (skipped: boolean) => V;
  readonly onLoadingMore: (results: ReadonlyArray<Item>) => W;
  readonly onCanLoadMore: (
    results: ReadonlyArray<Item>,
    loadMore: (numItems: number) => void,
  ) => X;
  readonly onExhausted: (results: ReadonlyArray<Item>) => Y;
} & ([E] extends [never]
  ? {}
  : {
      readonly onFailure: (error: E, results: ReadonlyArray<Item>) => Z;
    });

type MatchReturns<E, V, W, X, Y, Z> = [E] extends [never]
  ? V | W | X | Y
  : V | W | X | Y | Z;

/**
 * Matches a {@link PaginatedQueryResult} to the appropriate handler based on
 * its tag. If the provided result cannot fail (i.e. `E` is `never`),
 * `onFailure` is not required.
 */
export const match: {
  <Item, E, V, W, X, Y, Z = never>(
    options: MatchOptions<Item, E, V, W, X, Y, Z>,
  ): (self: Variants<Item, E>) => MatchReturns<E, V, W, X, Y, Z>;
  <Item, E, V, W, X, Y, Z = never>(
    self: Variants<Item, E>,
    options: MatchOptions<Item, E, V, W, X, Y, Z>,
  ): MatchReturns<E, V, W, X, Y, Z>;
} = Function.dual(
  2,
  <Item, E, V, W, X, Y, Z = never>(
    self: Variants<Item, E>,
    options: MatchOptions<Item, E, V, W, X, Y, Z>,
  ): MatchReturns<E, V, W, X, Y, Z> =>
    Match.value(self).pipe(
      Match.tag("LoadingFirstPage", (loadingFirstPage_) =>
        options.onLoadingFirstPage(loadingFirstPage_.skipped),
      ),
      Match.tag("LoadingMore", (loadingMore_) =>
        options.onLoadingMore(loadingMore_.results),
      ),
      Match.tag("CanLoadMore", (canLoadMore_) =>
        options.onCanLoadMore(canLoadMore_.results, canLoadMore_.loadMore),
      ),
      Match.tag("Exhausted", (exhausted_) =>
        options.onExhausted(exhausted_.results),
      ),
      Match.tag("Failure", (failure_) => {
        if (Predicate.hasProperty(options, "onFailure")) {
          return options.onFailure(failure_.error, failure_.results);
        }
        throw new Error(
          "`onFailure` is required when error schema is provided",
        );
      }),
      Match.exhaustive,
    ) as MatchReturns<E, V, W, X, Y, Z>,
);
