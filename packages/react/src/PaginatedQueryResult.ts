import { identity } from "effect/Function";
import * as Equal from "effect/Equal";
import * as Function from "effect/Function";
import * as Hash from "effect/Hash";
import * as Pipeable from "effect/Pipeable";
import * as Predicate from "effect/Predicate";

const TypeId = "@confect/react/PaginatedQueryResult";
type TypeId = typeof TypeId;

/**
 * A `PaginatedQueryResult` represents the result of a Confect paginated query.
 * The loaded variants mirror the statuses of `usePaginatedQuery` from
 * `convex/react` and all carry `results`, `isLoading`, and `loadMore`, so the
 * common UI shape — render the list, show a spinner while loading, offer a
 * load-more button — needs only an {@link isFailure} early-out and plain field
 * access.
 *
 * Every variant carries `results`, including `Failure`: when a later page
 * fails, the pages already loaded are still worth rendering alongside the
 * error, so they are not discarded. `Failure` additionally carries the
 * query's decoded typed error, and omits `loadMore`, which cannot make
 * progress from a failed state.
 *
 * When the query declares no `error` schema (`E` is `never`), the `Failure`
 * variant is excluded from the type entirely, so `isLoading` and `loadMore`
 * are accessible without any narrowing.
 *
 * @typeParam Item - The type of a decoded page item.
 * @typeParam E - The type of the decoded typed error in the `Failure` variant.
 */
export type PaginatedQueryResult<Item, E = never> = [E] extends [never]
  ? Loaded<Item, E>
  : Loaded<Item, E> | Failure<Item, E>;

/**
 * The non-`Failure` variants — those where the query is still making
 * progress, so `isLoading` and `loadMore` are available.
 */
export type Loaded<Item, E = never> =
  | LoadingFirstPage<Item, E>
  | LoadingMore<Item, E>
  | CanLoadMore<Item, E>
  | Exhausted<Item, E>;

/**
 * Every variant regardless of `E` — the parameter type for guards and
 * {@link match}, since `PaginatedQueryResult` itself excludes `Failure` when
 * `E` is `never`.
 */
export type Variants<Item, E = never> = Loaded<Item, E> | Failure<Item, E>;

export declare namespace PaginatedQueryResult {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface Proto<Item, E> extends Pipeable.Pipeable {
    readonly [TypeId]: {
      readonly E: (_: never) => E;
      readonly Item: (_: never) => Item;
    };
  }

  export type Item<R> = R extends Proto<infer Item_, infer _E> ? Item_ : never;

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Failure<R> = R extends Proto<infer _Item, infer E> ? E : never;
}

export interface LoadingFirstPage<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  readonly _tag: "LoadingFirstPage";
  readonly skipped: boolean;
  readonly results: ReadonlyArray<Item>;
  readonly isLoading: true;
  readonly loadMore: (numItems: number) => void;
}

export interface LoadingMore<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  readonly _tag: "LoadingMore";
  readonly results: ReadonlyArray<Item>;
  readonly isLoading: true;
  readonly loadMore: (numItems: number) => void;
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
  readonly loadMore: (numItems: number) => void;
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
  [TypeId]: {
    E: identity,
    Item: identity,
  },
  pipe(this: Variants<any, any>, ...args: ReadonlyArray<unknown>) {
    return Pipeable.pipeArguments(
      this,
      args as unknown as Parameters<typeof Pipeable.pipeArguments>[1],
    );
  },
  // `loadMore` is excluded from equality and hashing, like function fields
  // generally: two results that render identically are equal even though their
  // callbacks differ by identity.
  [Equal.symbol](this: Variants<any, any>, that: Variants<any, any>): boolean {
    if (this._tag !== that._tag) {
      return false;
    }
    switch (this._tag) {
      case "LoadingFirstPage":
        return this.skipped === (that as LoadingFirstPage<any, any>).skipped;
      case "LoadingMore":
      case "CanLoadMore":
      case "Exhausted":
        return Equal.equals(this.results, (that as Loaded<any, any>).results);
      case "Failure":
        return (
          Equal.equals(this.error, (that as Failure<any, any>).error) &&
          Equal.equals(this.results, (that as Failure<any, any>).results)
        );
    }
  },
  [Hash.symbol](this: Variants<any, any>): number {
    const tagHash = Hash.string(this._tag);
    switch (this._tag) {
      case "LoadingFirstPage":
        return Hash.cached(
          this,
          Hash.combine(tagHash)(Hash.hash(this.skipped)),
        );
      case "LoadingMore":
      case "CanLoadMore":
      case "Exhausted":
        return Hash.cached(
          this,
          Hash.combine(tagHash)(Hash.hash(this.results)),
        );
      case "Failure":
        return Hash.cached(
          this,
          Hash.combine(tagHash)(
            Hash.combine(Hash.hash(this.error))(Hash.hash(this.results)),
          ),
        );
    }
  },
};

const noResults: ReadonlyArray<never> = [];

export const loadingFirstPage = <Item = never, E = never>(options: {
  skipped: boolean;
  loadMore: (numItems: number) => void;
}): LoadingFirstPage<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "LoadingFirstPage" as const,
    skipped: options.skipped,
    results: noResults,
    isLoading: true as const,
    loadMore: options.loadMore,
  });

export const loadingMore = <Item, E = never>(options: {
  results: ReadonlyArray<Item>;
  loadMore: (numItems: number) => void;
}): LoadingMore<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "LoadingMore" as const,
    results: options.results,
    isLoading: true as const,
    loadMore: options.loadMore,
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
  loadMore: (numItems: number) => void;
}): Exhausted<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "Exhausted" as const,
    results: options.results,
    isLoading: false as const,
    loadMore: options.loadMore,
  });

export const fail = <E, Item = never>(options: {
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

export const isLoaded = <Item, E>(
  result: Variants<Item, E>,
): result is Loaded<Item, E> => result._tag !== "Failure";

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
  ): MatchReturns<E, V, W, X, Y, Z> => {
    switch (self._tag) {
      case "LoadingFirstPage":
        return options.onLoadingFirstPage(self.skipped);
      case "LoadingMore":
        return options.onLoadingMore(self.results);
      case "CanLoadMore":
        return options.onCanLoadMore(self.results, self.loadMore);
      case "Exhausted":
        return options.onExhausted(self.results);
      case "Failure": {
        if (Predicate.hasProperty(options, "onFailure")) {
          return options.onFailure(self.error, self.results) as MatchReturns<
            E,
            V,
            W,
            X,
            Y,
            Z
          >;
        }
        throw new Error(
          "`onFailure` is required when error schema is provided",
        );
      }
    }
  },
);
