import { pipe } from "effect/Function";
import * as Equal from "effect/Equal";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as PaginatedQueryResult from "@confect/react/PaginatedQueryResult";

const noop = (_numItems: number) => {};

describe("constructors", () => {
  test("loadingFirstPage sets skipped, empty results, and isLoading", () => {
    const r = PaginatedQueryResult.loadingFirstPage({
      skipped: true,
      loadMore: noop,
    });

    expect(r._tag).toBe("LoadingFirstPage");
    expect(r.skipped).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.isLoading).toBe(true);
    expect(PaginatedQueryResult.isLoadingFirstPage(r)).toBe(true);
    expect(PaginatedQueryResult.isLoading(r)).toBe(true);
    expect(PaginatedQueryResult.isLoaded(r)).toBe(true);
    expect(PaginatedQueryResult.isFailure(r)).toBe(false);
  });

  test("loadingMore carries results and isLoading", () => {
    const r = PaginatedQueryResult.loadingMore({
      results: [1, 2],
      loadMore: noop,
    });

    expect(r._tag).toBe("LoadingMore");
    expect(r.results).toEqual([1, 2]);
    expect(r.isLoading).toBe(true);
    expect(PaginatedQueryResult.isLoadingMore(r)).toBe(true);
    expect(PaginatedQueryResult.isLoading(r)).toBe(true);
  });

  test("canLoadMore carries results and loadMore", () => {
    const loadMore = (_numItems: number) => {};
    const r = PaginatedQueryResult.canLoadMore({ results: [1], loadMore });

    expect(r._tag).toBe("CanLoadMore");
    expect(r.isLoading).toBe(false);
    expect(r.loadMore).toBe(loadMore);
    expect(PaginatedQueryResult.isCanLoadMore(r)).toBe(true);
    expect(PaginatedQueryResult.isLoading(r)).toBe(false);
  });

  test("exhausted carries results", () => {
    const r = PaginatedQueryResult.exhausted({ results: [1], loadMore: noop });

    expect(r._tag).toBe("Exhausted");
    expect(r.isLoading).toBe(false);
    expect(PaginatedQueryResult.isExhausted(r)).toBe(true);
  });

  test("failure carries the error and the pages loaded before it", () => {
    const err = new Error("boom");
    const r = PaginatedQueryResult.failure({ error: err, results: [1, 2] });

    expect(r._tag).toBe("Failure");
    expect(r.error).toBe(err);
    expect(r.results).toEqual([1, 2]);
    expect(PaginatedQueryResult.isFailure(r)).toBe(true);
    expect(PaginatedQueryResult.isLoaded(r)).toBe(false);
  });
});

describe("isPaginatedQueryResult", () => {
  test("is true for values from constructors and false otherwise", () => {
    expect(
      PaginatedQueryResult.isPaginatedQueryResult(
        PaginatedQueryResult.failure({ error: "e", results: [] }),
      ),
    ).toBe(true);
    expect(PaginatedQueryResult.isPaginatedQueryResult({})).toBe(false);
    expect(PaginatedQueryResult.isPaginatedQueryResult(null)).toBe(false);
  });
});

describe("Equal", () => {
  test("loaded variants compare by tag and results, ignoring loadMore identity", () => {
    const results = [1, 2];
    const a = PaginatedQueryResult.canLoadMore({ results, loadMore: noop });
    const b = PaginatedQueryResult.canLoadMore({
      results,
      loadMore: (_n) => {},
    });
    const c = PaginatedQueryResult.exhausted({ results, loadMore: noop });

    expect(Equal.equals(a, b)).toBe(true);
    expect(Equal.equals(a, c)).toBe(false);
  });

  test("failures compare by error and results", () => {
    const results = [1, 2];

    expect(
      Equal.equals(
        PaginatedQueryResult.failure({ error: "e", results }),
        PaginatedQueryResult.failure({ error: "e", results }),
      ),
    ).toBe(true);
    expect(
      Equal.equals(
        PaginatedQueryResult.failure({ error: "e", results }),
        PaginatedQueryResult.failure({ error: "f", results }),
      ),
    ).toBe(false);
    expect(
      Equal.equals(
        PaginatedQueryResult.failure({ error: "e", results }),
        PaginatedQueryResult.failure({ error: "e", results: [3] }),
      ),
    ).toBe(false);
  });

  test("loadingFirstPage compares by skipped", () => {
    expect(
      Equal.equals(
        PaginatedQueryResult.loadingFirstPage({
          skipped: true,
          loadMore: noop,
        }),
        PaginatedQueryResult.loadingFirstPage({
          skipped: true,
          loadMore: noop,
        }),
      ),
    ).toBe(true);
    expect(
      Equal.equals(
        PaginatedQueryResult.loadingFirstPage({
          skipped: true,
          loadMore: noop,
        }),
        PaginatedQueryResult.loadingFirstPage({
          skipped: false,
          loadMore: noop,
        }),
      ),
    ).toBe(false);
  });
});

describe("pipe", () => {
  test("results are pipeable", () => {
    const r = PaginatedQueryResult.exhausted({ results: [1], loadMore: noop });

    expect(pipe(r, PaginatedQueryResult.isExhausted)).toBe(true);
  });
});

describe("match", () => {
  const handlers = {
    onLoadingFirstPage: (skipped: boolean) => `loading-first:${skipped}`,
    onLoadingMore: (results: ReadonlyArray<number>) =>
      `loading-more:${results.length}`,
    onCanLoadMore: (
      results: ReadonlyArray<number>,
      _loadMore: (n: number) => void,
    ) => `can-load-more:${results.length}`,
    onExhausted: (results: ReadonlyArray<number>) =>
      `exhausted:${results.length}`,
  };

  test("dispatches to the matching handler", () => {
    expect(
      PaginatedQueryResult.match(
        PaginatedQueryResult.loadingFirstPage<number>({
          skipped: false,
          loadMore: noop,
        }),
        handlers,
      ),
    ).toBe("loading-first:false");
    expect(
      PaginatedQueryResult.match(
        PaginatedQueryResult.canLoadMore<number>({
          results: [1, 2],
          loadMore: noop,
        }),
        handlers,
      ),
    ).toBe("can-load-more:2");
  });

  test("onFailure is required only when the result can fail", () => {
    const failing: PaginatedQueryResult.PaginatedQueryResult<number, string> =
      PaginatedQueryResult.failure({ error: "boom", results: [1, 2] });

    expect(
      PaginatedQueryResult.match(failing, {
        ...handlers,
        onFailure: (error, results) => `failure:${error}:${results.length}`,
      }),
    ).toBe("failure:boom:2");

    const infallible: PaginatedQueryResult.PaginatedQueryResult<number> =
      PaginatedQueryResult.exhausted({ results: [1], loadMore: noop });

    // No onFailure needed when E = never.
    expect(PaginatedQueryResult.match(infallible, handlers)).toBe(
      "exhausted:1",
    );

    expectTypeOf(
      PaginatedQueryResult.match(infallible, handlers),
    ).toEqualTypeOf<string>();
  });
});
