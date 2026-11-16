/**
 * @module
 *
 * @category Models
 */
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
 * shape—render the list, show a spinner while loading—needs only an
 * {@link isFailure} early-out and plain field access.
 *
 * Every variant carries `results`, including `Failure`: when a later page
 * fails, the pages already loaded are still worth rendering alongside the
 * error, so they are not discarded. `Failure` additionally carries the query's
 * decoded typed error.
 *
 * `loadMore` appears only on `CanLoadMore`, the one state it can make progress
 * from. The underlying Convex hook exposes it on every status, but calling it
 * while a page is in flight, once the list is exhausted, or after a failure is
 * an intentional no-op there; narrowing to `CanLoadMore`—via
 * {@link isCanLoadMore} or {@link match}—makes that statically apparent instead
 * of silently dropping the call.
 *
 * When the query declares no `error` schema (`E` is `never`), the `Failure`
 * variant is excluded from the type entirely, so `isLoading` is accessible
 * without any narrowing.
 *
 * @category Models
 *
 * @typeParam Item - The type of a decoded page item.
 * @typeParam E - The type of the decoded typed error in the `Failure` variant.
 */
export type PaginatedQueryResult<Item, E = never> = [E] extends [never]
  ? | LoadingFirstPage<Item, E>
    | LoadingMore<Item, E>
    | CanLoadMore<Item, E>
    | Exhausted<Item, E>
  : | LoadingFirstPage<Item, E>
    | LoadingMore<Item, E>
    | CanLoadMore<Item, E>
    | Exhausted<Item, E>
    | Failure<Item, E>;

/**
 * Every variant regardless of `E`—the parameter type for guards and
 * {@link match}, since `PaginatedQueryResult` itself excludes `Failure` when `E`
 * is `never`.
 *
 * @category Models
 */
export type Variants<Item, E = never> =
  | LoadingFirstPage<Item, E>
  | LoadingMore<Item, E>
  | CanLoadMore<Item, E>
  | Exhausted<Item, E>
  | Failure<Item, E>;

/**
 * Type utilities for extracting paginated item and declared error types.
 *
 * @category Models
 */
export declare namespace PaginatedQueryResult {
  /**
   * Shared pipeable shape; the phantom fields describe types, not runtime data.
   *
   * @category Models
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface Proto<out Item, out E> extends Pipeable.Pipeable {
    /**
     * Identifies values created by this module.
     *
     * @category Models
     */
    readonly [TypeId]: TypeId;
    /**
     * Type-only witness for a decoded page item.
     *
     * @category Models
     */
    readonly "~Item": Item;
    /**
     * Type-only witness for the decoded declared error.
     *
     * @category Models
     */
    readonly "~E": E;
  }

  /**
   * Extracts the decoded item type from a result type, or `never` otherwise.
   *
   * @category Models
   */
  export type Item<R> = R extends { readonly "~Item": infer Item_ }
    ? Item_
    : never;

  /**
   * Extracts the declared error type from a result type, or `never` otherwise.
   *
   * @category Models
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Failure<R> = R extends { readonly "~E": infer E } ? E : never;
}

/**
 * The first page is pending, or the hook was skipped and has no subscription.
 *
 * @category Models
 */
export interface LoadingFirstPage<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  /**
   * Discriminant for the initial loading/skipped state.
   *
   * @category Models
   */
  readonly _tag: "LoadingFirstPage";
  /**
   * `true` when the hook received `"skip"`.
   *
   * @category Models
   */
  readonly skipped: boolean;
  /**
   * An empty array until the first page is available.
   *
   * @category Models
   */
  readonly results: ReadonlyArray<Item>;
  /**
   * Always `true`, even when skipped; inspect `skipped` before showing a
   * spinner.
   *
   * @category Models
   */
  readonly isLoading: true;
}

/**
 * More pages are pending while previously loaded items remain available.
 *
 * @category Models
 */
export interface LoadingMore<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  /**
   * Discriminant for loading beyond the first page.
   *
   * @category Models
   */
  readonly _tag: "LoadingMore";
  /**
   * Decoded items from the pages currently available, in query order.
   *
   * @category Models
   */
  readonly results: ReadonlyArray<Item>;
  /**
   * Always `true` while more items or replacement pages are pending.
   *
   * @category Models
   */
  readonly isLoading: true;
}

/**
 * Loaded items are available and another page can be requested.
 *
 * @category Models
 */
export interface CanLoadMore<
  Item,
  E = never,
> extends PaginatedQueryResult.Proto<Item, E> {
  /**
   * Discriminant for the state in which `loadMore` can make progress.
   *
   * @category Models
   */
  readonly _tag: "CanLoadMore";
  /**
   * Decoded items from all loaded pages, in query order.
   *
   * @category Models
   */
  readonly results: ReadonlyArray<Item>;
  /**
   * Always `false`; no next page is currently pending.
   *
   * @category Models
   */
  readonly isLoading: false;
  /**
   * Requests the next page, targeting `numItems` additional items. Returns
   * immediately; observe later hook results for loading, success, or failure.
   * Call this only on the current `CanLoadMore` result, not a saved stale one.
   *
   * @category Subscriptions
   */
  readonly loadMore: (numItems: number) => void;
}

/**
 * All currently available pages are loaded; subscriptions can still update
 * their items.
 *
 * @category Models
 */
export interface Exhausted<Item, E = never> extends PaginatedQueryResult.Proto<
  Item,
  E
> {
  /**
   * Discriminant for a fully loaded result.
   *
   * @category Models
   */
  readonly _tag: "Exhausted";
  /**
   * Decoded items from all loaded pages, in query order.
   *
   * @category Models
   */
  readonly results: ReadonlyArray<Item>;
  /**
   * Always `false`; there is no further page to request.
   *
   * @category Models
   */
  readonly isLoading: false;
}

/**
 * A declared page failure, retaining the items loaded before the error.
 *
 * @category Models
 */
export interface Failure<Item, E = never> extends PaginatedQueryResult.Proto<
  Item,
  E
> {
  /**
   * Discriminant for a declared error; this state has no `loadMore` callback.
   *
   * @category Models
   */
  readonly _tag: "Failure";
  /**
   * The failure decoded through the ref's error schemas.
   *
   * @category Models
   */
  readonly error: E;
  /**
   * The pages loaded before the failure.
   *
   * @category Models
   */
  readonly results: ReadonlyArray<Item>;
}

/**
 * @internal
 */
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

/**
 * @internal
 */
export const loadingFirstPage = <Item = never, E = never>(options: {
  skipped: boolean;
}): LoadingFirstPage<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "LoadingFirstPage" as const,
    skipped: options.skipped,
    results: noResults,
    isLoading: true as const,
  });

/**
 * @internal
 */
export const loadingMore = <Item, E = never>(options: {
  results: ReadonlyArray<Item>;
}): LoadingMore<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "LoadingMore" as const,
    results: options.results,
    isLoading: true as const,
  });

/**
 * @internal
 */
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

/**
 * @internal
 */
export const exhausted = <Item, E = never>(options: {
  results: ReadonlyArray<Item>;
}): Exhausted<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "Exhausted" as const,
    results: options.results,
    isLoading: false as const,
  });

/**
 * @internal
 */
export const failure = <E, Item = never>(options: {
  error: E;
  results: ReadonlyArray<Item>;
}): Failure<Item, E> =>
  Object.assign(Object.create(PaginatedQueryResultProto), {
    _tag: "Failure" as const,
    error: options.error,
    results: options.results,
  });

/**
 * Narrows `result` to initial loading or skipped state; inspect `skipped` to
 * distinguish them.
 *
 * @category Refinements
 */
export const isLoadingFirstPage = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingFirstPage<Item, E> => result._tag === "LoadingFirstPage";

/**
 * Narrows `result` to loading more pages while retaining already available
 * items.
 *
 * @category Refinements
 */
export const isLoadingMore = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingMore<Item, E> => result._tag === "LoadingMore";

/**
 * Narrows `result` to the only variant exposing an actionable `loadMore`
 * callback.
 *
 * @category Refinements
 */
export const isCanLoadMore = <Item, E>(
  result: Variants<Item, E>,
): result is CanLoadMore<Item, E> => result._tag === "CanLoadMore";

/**
 * Narrows `result` to the state with all current pages loaded.
 *
 * @category Refinements
 */
export const isExhausted = <Item, E>(
  result: Variants<Item, E>,
): result is Exhausted<Item, E> => result._tag === "Exhausted";

/**
 * Narrows `result` to a declared page failure, exposing `error` and retained
 * `results`.
 *
 * @category Refinements
 */
export const isFailure = <Item, E>(
  result: Variants<Item, E>,
): result is Failure<Item, E> => result._tag === "Failure";

/**
 * Narrows `result` to either loading variant, including a skipped first page.
 *
 * @category Refinements
 */
export const isLoading = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingFirstPage<Item, E> | LoadingMore<Item, E> =>
  result._tag === "LoadingFirstPage" || result._tag === "LoadingMore";

type MatchOptions<Item, E, V, W, X, Y, Z> = {
  /**
   * Handles an initial or skipped query; receives whether it was skipped.
   *
   * @category Pattern matching
   */
  readonly onLoadingFirstPage: (skipped: boolean) => V;
  /**
   * Handles pending pages while receiving the decoded items already available.
   *
   * @category Pattern matching
   */
  readonly onLoadingMore: (results: ReadonlyArray<Item>) => W;
  /**
   * Handles loaded items and a callback that requests `numItems` more items.
   *
   * @category Pattern matching
   */
  readonly onCanLoadMore: (
    results: ReadonlyArray<Item>,
    loadMore: (numItems: number) => void,
  ) => X;
  /**
   * Handles all currently loaded items when no further page is available.
   *
   * @category Pattern matching
   */
  readonly onExhausted: (results: ReadonlyArray<Item>) => Y;
} & ([E] extends [never]
  ? {}
  : {
      /**
       * Handles the decoded declared error and items retained before it.
       *
       * @category Pattern matching
       */
      readonly onFailure: (error: E, results: ReadonlyArray<Item>) => Z;
    });

type MatchReturns<E, V, W, X, Y, Z> = [E] extends [never]
  ? V | W | X | Y
  : V | W | X | Y | Z;

/**
 * Matches a {@link PaginatedQueryResult} to the appropriate handler based on its
 * tag. If the provided result cannot fail (i.e. `E` is `never`), `onFailure` is
 * not required.
 *
 * @category Pattern matching
 *
 * @param self - The result to inspect, or supply it later in the curried form.
 * @param options - Handlers for every possible state. `onCanLoadMore` receives
 *   the decoded items and `loadMore`; `onFailure` receives the error and
 *   retained items. Other loaded-state handlers receive items; initial loading
 *   receives the `skipped` flag.
 *
 * @returns The selected handler's return value. Supports both `match(result,
 *   handlers)` and `result.pipe(match(handlers))`.
 *
 * @throws If a runtime `Failure` reaches a handler set without `onFailure`, or
 *   if the selected callback throws.
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
