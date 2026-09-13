import { FunctionSpec, Ref } from "@confect/core";
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import * as Schema from "effect/Schema";
import * as MutableRef from "effect/MutableRef";
import { assert, beforeEach, describe, expect, test } from "@effect/vitest";
import { vi } from "vitest";
import type { StreamPagination } from "@confect/react";
import { PaginatedQueryResult } from "@confect/react";
import { createHooks, type ConvexHooks } from "../src/internal/hooks";
import { convexHooks } from "../src/internal/convex";

const useQueriesMock = vi.fn<ConvexHooks["useQueries"]>();

const { useStreamPaginatedQuery } = createHooks({
  ...convexHooks,
  useQueries: useQueriesMock,
});

const Item = Schema.Struct({ value: Schema.FiniteFromString });

const list = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "list",
    item: () => Item,
  }),
);

const listWithArgs = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "listWithArgs",
    args: () => ({ count: Schema.FiniteFromString }),
    item: () => Item,
  }),
);

class Boom extends Schema.TaggedError<Boom>()("Boom", {
  reason: Schema.String,
}) {}

const listOrFail = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "listOrFail",
    item: () => Item,
    error: () => Boom,
  }),
);

/**
 * The mock serves each subscribed page from `responses`, keyed by the page's
 * `paginationOpts`—so tests observe exactly which page ranges the hook
 * subscribes, and control when each loads.
 */
const responses = MutableRef.make(
  new Map<string, StreamPagination.PageResult | Error>(),
);

const respond = (
  paginationOpts: StreamPagination.PageRequest,
  result: StreamPagination.PageResult | Error,
) => {
  MutableRef.get(responses).set(JSON.stringify(paginationOpts), result);
};

const subscribedOpts = () =>
  Object.values(useQueriesMock.mock.lastCall![0]).map(
    (request) => request.args.paginationOpts,
  );

/**
 * Snapshot `result.current` without TypeScript carrying narrowing from an
 * earlier `assert` across an `act`/`rerender` (the property access itself stays
 * narrowed otherwise).
 */
const current = <A>(result: { readonly current: A }): A => result.current;

beforeEach(() => {
  MutableRef.set(responses, new Map());
  useQueriesMock.mockReset();
  useQueriesMock.mockImplementation((queries) =>
    Object.fromEntries(
      Object.entries(queries).map(([key, request]) => [
        key,
        MutableRef.get(responses).get(
          JSON.stringify(request.args.paginationOpts),
        ),
      ]),
    ),
  );
});

/**
 * Respond to the initial growing page and its pinned twin so the hook settles
 * at one pinned first page (the state every loaded page reaches).
 */
const respondFirstPage = (result: StreamPagination.PageResult) => {
  respond({ numItems: 2, cursor: null }, result);
  respond({ numItems: 2, cursor: null, endCursor: "c0" }, result);
};

describe("useStreamPaginatedQuery", () => {
  test("pins the first page to its range once loaded, decoding its items", () => {
    respond(
      { numItems: 2, cursor: null },
      {
        page: [{ value: "1" }, { value: "2" }],
        isDone: false,
        continueCursor: "c0",
      },
    );

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    // The loaded growing page pins itself to the range it just served, so
    // it stops being a sliding window; it keeps rendering while the pinned
    // twin loads.
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null },
      { numItems: 2, cursor: null, endCursor: "c0" },
    ]);
    const whilePinning = current(result);
    assert(PaginatedQueryResult.isLoadingMore(whilePinning));
    expect(whilePinning.results).toEqual([{ value: 1 }, { value: 2 }]);

    respond(
      { numItems: 2, cursor: null, endCursor: "c0" },
      {
        page: [{ value: "1" }, { value: "2" }],
        isDone: false,
        continueCursor: "c0",
      },
    );
    rerender();

    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, endCursor: "c0" },
    ]);
    const pinned = current(result);
    assert(PaginatedQueryResult.isCanLoadMore(pinned));
    expect(pinned.results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("encodes user args into every page subscription", () => {
    renderHook(() =>
      useStreamPaginatedQuery(
        listWithArgs,
        { count: 42 },
        { initialNumItems: 2 },
      ),
    );

    const request = Object.values(useQueriesMock.mock.lastCall![0])[0]!;

    expect(request.args).toEqual({
      count: "42",
      paginationOpts: { numItems: 2, cursor: null },
    });
  });

  test("is LoadingFirstPage until the first page loads, and when skipped", () => {
    const { result } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    assert(PaginatedQueryResult.isLoadingFirstPage(result.current));
    expect(result.current.skipped).toBe(false);

    const { result: skipped } = renderHook(() =>
      useStreamPaginatedQuery(list, "skip", { initialNumItems: 2 }),
    );

    assert(PaginatedQueryResult.isLoadingFirstPage(skipped.current));
    expect(skipped.current.skipped).toBe(true);
    expect(subscribedOpts()).toEqual([]);
  });

  test("loadMore appends a growing page after the pinned last page", () => {
    respondFirstPage({
      page: [{ value: "1" }, { value: "2" }],
      isDone: false,
      continueCursor: "c0",
    });

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    rerender();
    assert(PaginatedQueryResult.isCanLoadMore(current(result)));
    act(() => {
      const canLoadMore = current(result);
      assert(PaginatedQueryResult.isCanLoadMore(canLoadMore));
      canLoadMore.loadMore(2);
    });

    // The last page is already pinned, so loading more just appends a new
    // growing page after it.
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, endCursor: "c0" },
      { numItems: 2, cursor: "c0" },
    ]);
    const whileLoading = current(result);
    assert(PaginatedQueryResult.isLoadingMore(whileLoading));
    expect(whileLoading.results).toEqual([{ value: 1 }, { value: 2 }]);

    respond(
      { numItems: 2, cursor: "c0" },
      { page: [{ value: "3" }], isDone: true, continueCursor: "c1" },
    );
    rerender();
    // The exhausted page pins itself too; once its twin loads, the list
    // settles.
    respond(
      { numItems: 2, cursor: "c0", endCursor: "c1" },
      { page: [{ value: "3" }], isDone: true, continueCursor: "c1" },
    );
    rerender();

    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, endCursor: "c0" },
      { numItems: 2, cursor: "c0", endCursor: "c1" },
    ]);
    const afterSwap = current(result);
    assert(PaginatedQueryResult.isExhausted(afterSwap));
    expect(afterSwap.results).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
  });

  test("splits a page the server recommends splitting", () => {
    respond(
      { numItems: 2, cursor: null },
      {
        page: [{ value: "1" }, { value: "2" }, { value: "3" }],
        isDone: false,
        continueCursor: "c0",
        pageStatus: "SplitRecommended",
        splitCursor: "s",
      },
    );

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    // The overgrown page keeps rendering while its two halves load; the
    // second half keeps the page's growing tail (no endCursor).
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null },
      { numItems: 2, cursor: null, endCursor: "s" },
      { numItems: 2, cursor: "s" },
    ]);
    const whileSplitting = current(result);
    assert(PaginatedQueryResult.isLoadingMore(whileSplitting));
    expect(whileSplitting.results).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);

    respond(
      { numItems: 2, cursor: null, endCursor: "s" },
      { page: [{ value: "1" }], isDone: false, continueCursor: "s" },
    );
    respond(
      { numItems: 2, cursor: "s" },
      {
        page: [{ value: "2" }, { value: "3" }],
        isDone: false,
        continueCursor: "c0",
      },
    );
    rerender();
    // The swapped-in growing half pins itself like any loaded page.
    respond(
      { numItems: 2, cursor: "s", endCursor: "c0" },
      {
        page: [{ value: "2" }, { value: "3" }],
        isDone: false,
        continueCursor: "c0",
      },
    );
    rerender();

    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, endCursor: "s" },
      { numItems: 2, cursor: "s", endCursor: "c0" },
    ]);
    const afterSplit = current(result);
    assert(PaginatedQueryResult.isCanLoadMore(afterSplit));
    expect(afterSplit.results).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
  });

  test("forwards read budgets to every growing page", () => {
    const budget = { maximumRowsRead: 50, maximumBytesRead: 4096 };
    respond(
      { numItems: 2, cursor: null, ...budget },
      {
        page: [{ value: "1" }, { value: "2" }],
        isDone: false,
        continueCursor: "c0",
      },
    );
    respond(
      { numItems: 2, cursor: null, ...budget, endCursor: "c0" },
      {
        page: [{ value: "1" }, { value: "2" }],
        isDone: false,
        continueCursor: "c0",
      },
    );

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2, ...budget }),
    );

    rerender();

    // Every page carries the budgets: the first page, the pinned twin it
    // is replaced by (a pinned range can still grow past a budget), and
    // each page `loadMore` appends.
    const canLoadMore = current(result);
    assert(PaginatedQueryResult.isCanLoadMore(canLoadMore));
    act(() => {
      canLoadMore.loadMore(2);
    });
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, ...budget, endCursor: "c0" },
      { numItems: 2, cursor: "c0", ...budget },
    ]);
  });

  test("truncates before a page the server could not fetch in full", () => {
    respond(
      { numItems: 2, cursor: null },
      {
        page: [{ value: "1" }],
        isDone: false,
        continueCursor: "c0",
        pageStatus: "SplitRequired",
        splitCursor: "s",
      },
    );

    const { result } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    // The incomplete page's items are withheld while its halves load; the
    // second half keeps the growing tail rather than pinning at the
    // truncation point, so no range is orphaned.
    assert(PaginatedQueryResult.isLoadingFirstPage(result.current));
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null },
      { numItems: 2, cursor: null, endCursor: "s" },
      { numItems: 2, cursor: "s" },
    ]);
  });

  test("returns a decoded typed error as Failure with the loaded pages", () => {
    respondFirstPage({
      page: [{ value: "1" }],
      isDone: false,
      continueCursor: "c0",
    });

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(listOrFail, {}, { initialNumItems: 2 }),
    );

    rerender();
    act(() => {
      const canLoadMore = current(result);
      assert(PaginatedQueryResult.isCanLoadMore(canLoadMore));
      canLoadMore.loadMore(2);
    });
    respond(
      { numItems: 2, cursor: "c0" },
      new ConvexError(Schema.encodeSync(Boom)(new Boom({ reason: "nope" }))),
    );
    rerender();

    assert(PaginatedQueryResult.isFailure(result.current));
    expect(result.current.error).toBeInstanceOf(Boom);
    expect(result.current.error.reason).toBe("nope");
    expect(result.current.results).toEqual([{ value: 1 }]);
  });

  test("throws unknown errors", () => {
    respond({ numItems: 2, cursor: null }, new Error("boom"));

    expect(() =>
      renderHook(() =>
        useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
      ),
    ).toThrow("boom");
  });

  test("resets pagination when a cursor becomes invalid", () => {
    respondFirstPage({
      page: [{ value: "1" }, { value: "2" }],
      isDone: false,
      continueCursor: "c0",
    });

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    rerender();
    act(() => {
      const canLoadMore = current(result);
      assert(PaginatedQueryResult.isCanLoadMore(canLoadMore));
      canLoadMore.loadMore(2);
    });
    respond(
      { numItems: 2, cursor: "c0" },
      new ConvexError({ paginationError: "InvalidCursor" }),
    );
    rerender();

    // Back to a first page reloading from the start; both its cached
    // results arrive immediately, so it settles pinned within the render.
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, endCursor: "c0" },
    ]);
    assert(PaginatedQueryResult.isCanLoadMore(current(result)));
    expect(current(result).results).toEqual([{ value: 1 }, { value: 2 }]);
  });
});
