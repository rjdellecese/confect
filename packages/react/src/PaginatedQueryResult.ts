/**
 * States and helpers for rendering a reactive list one page at a time.
 *
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
 * The state of a paginated query, including its decoded items in query order.
 * Every variant carries `results`, so a later page failure can display the
 * items already loaded alongside its decoded error.
 *
 * **Details**
 *
 * Narrow with {@link isCanLoadMore} before calling `loadMore`, or use
 * {@link match} to handle every state. Only `CanLoadMore` can request another
 * page. Every non-failure state exposes `isLoading`.
 *
 * **Gotchas**
 *
 * `Failure` has no `isLoading` flag. Check {@link isFailure} first if the query
 * declares an error; otherwise the result type excludes `Failure`.
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
 * The union accepted by the guards and {@link match}, including the failure
 * state even when `E` is `never`.
 *
 * @category Utility types
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
 * @category Utility types
 */
export declare namespace PaginatedQueryResult {
  /**
   * Shared pipeable shape; the phantom fields describe types, not runtime data.
   *
   * @category Prototypes
   */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface Proto<out Item, out E> extends Pipeable.Pipeable {
    /**
     * Brand shared by all paginated result variants.
     *
     * @category Type IDs
     */
    readonly [TypeId]: TypeId;
    /**
     * Type-only witness for a decoded page item.
     *
     * @category Utility types
     */
    readonly "~Item": Item;
    /**
     * Type-only witness for the decoded declared error.
     *
     * @category Utility types
     */
    readonly "~E": E;
  }

  /**
   * Extracts the decoded item type from a result type, or `never` otherwise.
   *
   * @category Utility types
   */
  export type Item<R> = R extends { readonly "~Item": infer Item_ }
    ? Item_
    : never;

  /**
   * Extracts the declared error type from a result type, or `never` otherwise.
   *
   * @category Utility types
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
   * Requests the next page and returns immediately. Observe subsequent hook
   * results for the new items or a failure.
   *
   * **Gotchas**
   *
   * Call `loadMore` on the current `CanLoadMore` result, not a callback saved
   * from a previous render.
   *
   * @category Subscriptions
   *
   * @param numItems - The target number of additional items to request.
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
   * The decoded items retained from pages loaded before the failure.
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

class PaginatedQueryResultProto<Item, E>
  extends Pipeable.Class
  implements PaginatedQueryResult.Proto<Item, E>
{
  declare readonly "~Item": Item;
  declare readonly "~E": E;
  get [TypeId](): TypeId {
    return TypeId;
  }
  /**
   * `CanLoadMore`'s `loadMore` is excluded from equality and hashing, like
   * function fields generally: two results that render identically are equal
   * even though their callbacks differ by identity.
   */
  [Equal.symbol](
    this: Variants<unknown, unknown>,
    that: Variants<unknown, unknown>,
  ): boolean {
    return Match.value(this).pipe(
      Match.tag(
        "LoadingFirstPage",
        (self) =>
          that._tag === "LoadingFirstPage" && self.skipped === that.skipped,
      ),
      Match.tag(
        "LoadingMore",
        "CanLoadMore",
        "Exhausted",
        (self) =>
          self._tag === that._tag && Equal.equals(self.results, that.results),
      ),
      Match.tag(
        "Failure",
        (self) =>
          that._tag === "Failure" &&
          Equal.equals(self.error, that.error) &&
          Equal.equals(self.results, that.results),
      ),
      Match.exhaustive,
    );
  }
  [Hash.symbol](this: Variants<unknown, unknown>): number {
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
  }
}

const noResults: ReadonlyArray<never> = [];

/**
 * @internal
 */
export const loadingFirstPage = <Item = never, E = never>(options: {
  skipped: boolean;
}): LoadingFirstPage<Item, E> =>
  Object.assign(new PaginatedQueryResultProto<Item, E>(), {
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
  Object.assign(new PaginatedQueryResultProto<Item, E>(), {
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
  Object.assign(new PaginatedQueryResultProto<Item, E>(), {
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
  Object.assign(new PaginatedQueryResultProto<Item, E>(), {
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
  Object.assign(new PaginatedQueryResultProto<Item, E>(), {
    _tag: "Failure" as const,
    error: options.error,
    results: options.results,
  });

/**
 * Narrows `result` to initial loading or skipped state; inspect `skipped` to
 * distinguish them.
 *
 * @category Guards
 */
export const isLoadingFirstPage = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingFirstPage<Item, E> => result._tag === "LoadingFirstPage";

/**
 * Narrows `result` to loading more pages while retaining already available
 * items.
 *
 * @category Guards
 */
export const isLoadingMore = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingMore<Item, E> => result._tag === "LoadingMore";

/**
 * Narrows `result` to the only variant exposing an actionable `loadMore`
 * callback.
 *
 * @category Guards
 */
export const isCanLoadMore = <Item, E>(
  result: Variants<Item, E>,
): result is CanLoadMore<Item, E> => result._tag === "CanLoadMore";

/**
 * Narrows `result` to the state with all current pages loaded.
 *
 * @category Guards
 */
export const isExhausted = <Item, E>(
  result: Variants<Item, E>,
): result is Exhausted<Item, E> => result._tag === "Exhausted";

/**
 * Narrows `result` to a declared page failure, exposing `error` and retained
 * `results`.
 *
 * @category Guards
 */
export const isFailure = <Item, E>(
  result: Variants<Item, E>,
): result is Failure<Item, E> => result._tag === "Failure";

/**
 * Narrows the result to `LoadingFirstPage` or `LoadingMore`. A skipped query
 * still counts as loading; check `skipped` on `LoadingFirstPage` to distinguish
 * it.
 *
 * @category Guards
 */
export const isLoading = <Item, E>(
  result: Variants<Item, E>,
): result is LoadingFirstPage<Item, E> | LoadingMore<Item, E> =>
  result._tag === "LoadingFirstPage" || result._tag === "LoadingMore";

type MatchOptions<Item, E, V, W, X, Y, Z> = {
  /**
   * Handles an initial or skipped query; receives whether it was skipped.
   *
   * @category Folding
   */
  readonly onLoadingFirstPage: (skipped: boolean) => V;
  /**
   * Handles pending pages while receiving the decoded items already available.
   *
   * @category Folding
   */
  readonly onLoadingMore: (results: ReadonlyArray<Item>) => W;
  /**
   * Handles loaded items and a callback that requests `numItems` more items.
   *
   * @category Folding
   */
  readonly onCanLoadMore: (
    results: ReadonlyArray<Item>,
    loadMore: (numItems: number) => void,
  ) => X;
  /**
   * Handles all currently loaded items when no further page is available.
   *
   * @category Folding
   */
  readonly onExhausted: (results: ReadonlyArray<Item>) => Y;
} & ([E] extends [never]
  ? object
  : {
      /**
       * Handles the decoded declared error and items retained before it.
       *
       * @category Folding
       */
      readonly onFailure: (error: E, results: ReadonlyArray<Item>) => Z;
    });

type MatchReturns<E, V, W, X, Y, Z> = [E] extends [never]
  ? V | W | X | Y
  : V | W | X | Y | Z;

/**
 * Returns the value of the handler for the current {@link PaginatedQueryResult}
 * state. Only a query that declares an error needs an `onFailure` handler.
 *
 * @category Folding
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- match excludes Z when E is never: only a Failure can invoke onFailure, and its error must be an E.
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
