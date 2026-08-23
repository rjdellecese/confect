/**
 * PROTOTYPE — the pure state machine behind {@link useStreamPaginatedQuery}
 * (see `notes/stream-based-querying.md` in the repo root).
 *
 * Reactive pagination without the query journal: each loaded page is pinned
 * to a fixed index range by echoing its `continueCursor` back as the next
 * subscription's `endCursor`, so adjacent pages stay exactly contiguous as
 * data changes — the "range-defined pages" the Fully Reactive Pagination
 * article calls for, and the mechanism of `convex-helpers/react`'s
 * `usePaginatedQuery`.
 *
 * Loading more and splitting an overgrown page are the same transition
 * shape: the affected page keeps rendering while a pair of replacement
 * subscriptions ("ongoing split") loads, and is swapped out once both have
 * results.
 */
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { pipe } from "effect/Function";
import * as Record from "effect/Record";

/** The `paginationOpts` one subscribed page queries with. */
export interface PageRequest {
  readonly numItems: number;
  readonly cursor: string | null;
  /** Present once the page is pinned to a fixed range. */
  readonly endCursor?: string;
}

export interface State {
  readonly nextPageKey: number;
  /** Page keys in display order. */
  readonly pageKeys: ReadonlyArray<string>;
  /** The request each subscribed page queries with, by page key. */
  readonly pages: Record.ReadonlyRecord<string, PageRequest>;
  /**
   * Pages being replaced by a pair of narrower subscriptions: the original
   * stays subscribed (and rendered) until both replacements have results.
   */
  readonly ongoingSplits: Record.ReadonlyRecord<
    string,
    readonly [string, string]
  >;
}

/** The skipped state: nothing subscribed. */
export const empty: State = {
  nextPageKey: 0,
  pageKeys: [],
  pages: Record.empty(),
  ongoingSplits: Record.empty(),
};

/** One growing (unpinned) page from the start of the stream. */
export const initial = (initialNumItems: number): State => ({
  nextPageKey: 1,
  pageKeys: ["0"],
  pages: Record.singleton("0", { numItems: initialNumItems, cursor: null }),
  ongoingSplits: Record.empty(),
});

/**
 * Pin the growing last page at `continueCursor` and start a new growing
 * page from there. Modeled as a split of the last page into its pinned
 * replacement and the new page, so the swap waits for both.
 */
export const loadMore =
  (continueCursor: string, numItems: number): ((state: State) => State) =>
  (state) =>
    pipe(
      Option.Do,
      Option.bind("lastKey", () => Array.last(state.pageKeys)),
      Option.bind("lastPage", ({ lastKey }) =>
        Record.get(state.pages, lastKey),
      ),
      Option.match({
        onNone: () => state,
        onSome: ({ lastKey, lastPage }) => {
          const pinnedKey = String(state.nextPageKey);
          const nextKey = String(state.nextPageKey + 1);
          return {
            nextPageKey: state.nextPageKey + 2,
            pageKeys: state.pageKeys,
            pages: pipe(
              state.pages,
              Record.set(pinnedKey, { ...lastPage, endCursor: continueCursor }),
              Record.set(nextKey, { numItems, cursor: continueCursor }),
            ),
            ongoingSplits: Record.set(state.ongoingSplits, lastKey, [
              pinnedKey,
              nextKey,
            ] as const),
          };
        },
      }),
    );

/**
 * Split the page at `key` into two pinned ranges meeting at `splitCursor`
 * and ending at `endCursor` (the page's own continue cursor).
 */
export const split =
  (
    key: string,
    splitCursor: string,
    endCursor: string,
  ): ((state: State) => State) =>
  (state) =>
    Option.match(Record.get(state.pages, key), {
      onNone: () => state,
      onSome: (page) => {
        const firstKey = String(state.nextPageKey);
        const secondKey = String(state.nextPageKey + 1);
        return {
          nextPageKey: state.nextPageKey + 2,
          pageKeys: state.pageKeys,
          pages: pipe(
            state.pages,
            Record.set(firstKey, { ...page, endCursor: splitCursor }),
            Record.set(secondKey, { ...page, cursor: splitCursor, endCursor }),
          ),
          ongoingSplits: Record.set(state.ongoingSplits, key, [
            firstKey,
            secondKey,
          ] as const),
        };
      },
    });

/** Swap a completed split's replacements in for the original page. */
export const completeSplit =
  (key: string): ((state: State) => State) =>
  (state) =>
    Option.match(Record.get(state.ongoingSplits, key), {
      onNone: () => state,
      onSome: ([firstKey, secondKey]) => ({
        nextPageKey: state.nextPageKey,
        pageKeys: Array.flatMap(state.pageKeys, (pageKey) =>
          pageKey === key ? [firstKey, secondKey] : [pageKey],
        ),
        pages: Record.remove(state.pages, key),
        ongoingSplits: Record.remove(state.ongoingSplits, key),
      }),
    });

/** Whether the last (rendered) page is currently being split or pinned. */
export const isLastPageSplitting = (state: State): boolean =>
  Option.exists(Array.last(state.pageKeys), (lastKey) =>
    Record.has(state.ongoingSplits, lastKey),
  );

/** Build one subscription request per subscribed page. */
export const pageRequests = <A>(
  state: State,
  f: (page: PageRequest) => A,
): Record.ReadonlyRecord<string, A> => Record.map(state.pages, f);

/** The per-page results a render observes, keyed like {@link pageRequests}. */
export type Results = Record.ReadonlyRecord<
  string,
  PageResult | Error | undefined
>;

// -----------------------------------------------------------------------------
// Interpretation
// -----------------------------------------------------------------------------

/** The wire shape of one loaded page. */
export interface PageResult {
  readonly page: ReadonlyArray<unknown>;
  readonly isDone: boolean;
  readonly continueCursor: string;
  readonly splitCursor?: string | null;
  readonly pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

/**
 * What one render pass derives from the subscribed pages' results: the
 * items to show, the trailing complete result (absent while the tail is
 * loading or force-splitting), state transitions to apply, and whether a
 * failure or an invalid cursor was hit.
 */
export type Interpretation =
  | { readonly _tag: "ResetRequired" }
  | {
      readonly _tag: "Failed";
      readonly error: unknown;
      /** Encoded items loaded before the failing page. */
      readonly items: ReadonlyArray<unknown>;
    }
  | {
      readonly _tag: "Interpreted";
      /** Encoded items across the loaded pages, in order. */
      readonly items: ReadonlyArray<unknown>;
      /** The last page's result, when every page has loaded completely. */
      readonly lastResult: Option.Option<PageResult>;
      /** Split/swap transitions this render discovered. */
      readonly transitions: ReadonlyArray<(state: State) => State>;
    };

const interpreted = (
  items: ReadonlyArray<unknown>,
  lastResult: Option.Option<PageResult>,
  transitions: ReadonlyArray<(state: State) => State>,
): Interpretation => ({ _tag: "Interpreted", items, lastResult, transitions });

/**
 * Walk the pages in display order, concatenating their items and
 * collecting the transitions to apply (completed split swaps, recommended
 * splits, eager splits of pages that outgrew `initialNumItems`).
 *
 * `isInvalidCursorError` marks errors that call for a full pagination
 * reset rather than a failure (the cursor no longer matches the query).
 */
export const interpret = (
  state: State,
  results: Record.ReadonlyRecord<string, PageResult | Error | undefined>,
  options: {
    readonly initialNumItems: number;
    readonly isInvalidCursorError: (error: Error) => boolean;
  },
): Interpretation => {
  const go = (
    remaining: ReadonlyArray<string>,
    items: ReadonlyArray<unknown>,
    transitions: ReadonlyArray<(s: State) => State>,
    lastResult: Option.Option<PageResult>,
  ): Interpretation =>
    Option.match(Array.head(remaining), {
      onNone: () => interpreted(items, lastResult, transitions),
      onSome: (pageKey) => {
        const result = Record.get(results, pageKey).pipe(
          Option.flatMap(Option.fromNullishOr),
          Option.getOrUndefined,
        );
        if (result === undefined) {
          // The trailing pages are still loading.
          return interpreted(items, Option.none(), transitions);
        }
        if (result instanceof Error) {
          return options.isInvalidCursorError(result)
            ? { _tag: "ResetRequired" }
            : { _tag: "Failed", error: result, items };
        }

        const ongoingSplit = Record.get(state.ongoingSplits, pageKey);
        const nextTransitions = Option.match(ongoingSplit, {
          onSome: ([firstKey, secondKey]) =>
            // Swap the replacements in once both have results.
            Record.get(results, firstKey).pipe(
              Option.flatMap(Option.fromNullishOr),
              Option.isSome,
            ) &&
            Record.get(results, secondKey).pipe(
              Option.flatMap(Option.fromNullishOr),
              Option.isSome,
            )
              ? Array.append(transitions, completeSplit(pageKey))
              : transitions,
          onNone: () =>
            typeof result.splitCursor === "string" &&
            (result.pageStatus === "SplitRecommended" ||
              result.pageStatus === "SplitRequired" ||
              result.page.length > options.initialNumItems)
              ? Array.append(
                  transitions,
                  split(pageKey, result.splitCursor, result.continueCursor),
                )
              : transitions,
        });

        // A force-split page couldn't be fetched in full: show the items
        // before it and report the tail as still loading.
        return result.pageStatus === "SplitRequired"
          ? interpreted(items, Option.none(), nextTransitions)
          : go(
              Array.drop(remaining, 1),
              Array.appendAll(items, result.page),
              nextTransitions,
              Option.some(result),
            );
      },
    });

  return go(state.pageKeys, [], [], Option.none());
};
