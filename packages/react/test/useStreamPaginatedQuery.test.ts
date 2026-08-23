import { FunctionSpec, Ref } from "@confect/core";
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import * as Schema from "effect/Schema";
import { assert, beforeEach, describe, expect, test } from "@effect/vitest";
import { vi } from "vitest";
import { useStreamPaginatedQuery } from "@confect/react";

const useQueriesMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
  usePaginatedQuery: () => {
    throw new Error("unexpected call to the public usePaginatedQuery");
  },
  usePaginatedQueryInternal: vi.fn(),
  useQueries: (...args: unknown[]) => useQueriesMock(...args),
}));

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
 * The mock serves each subscribed page from `responses`, keyed by the
 * page's `paginationOpts` — so tests observe exactly which page ranges the
 * hook subscribes, and control when each loads.
 */
let responses: Map<string, unknown>;

const respond = (paginationOpts: object, result: unknown) => {
  responses.set(JSON.stringify(paginationOpts), result);
};

const subscribedOpts = () =>
  Object.values(
    useQueriesMock.mock.lastCall![0] as Record<
      string,
      { args: { paginationOpts: object } }
    >,
  ).map((request) => request.args.paginationOpts);

/**
 * Snapshot `result.current` without TypeScript carrying narrowing from an
 * earlier `assert` across an `act`/`rerender` (the property access itself
 * stays narrowed otherwise).
 */
const current = <A>(result: { readonly current: A }): A => result.current;

beforeEach(() => {
  responses = new Map();
  useQueriesMock.mockReset();
  useQueriesMock.mockImplementation(
    (queries: Record<string, { args: { paginationOpts: unknown } }>) =>
      Object.fromEntries(
        Object.entries(queries).map(([key, request]) => [
          key,
          responses.get(JSON.stringify(request.args.paginationOpts)),
        ]),
      ),
  );
});

describe("useStreamPaginatedQuery", () => {
  test("subscribes one growing page and decodes its items", () => {
    respond(
      { numItems: 2, cursor: null },
      {
        page: [{ value: "1" }, { value: "2" }],
        isDone: false,
        continueCursor: "c0",
      },
    );

    const { result } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );

    expect(subscribedOpts()).toEqual([{ numItems: 2, cursor: null }]);
    assert(result.current._tag === "CanLoadMore");
    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("encodes user args into every page subscription", () => {
    renderHook(() =>
      useStreamPaginatedQuery(
        listWithArgs,
        { count: 42 },
        { initialNumItems: 2 },
      ),
    );

    const request = Object.values(
      useQueriesMock.mock.lastCall![0] as Record<string, { args: object }>,
    )[0]!;
    expect(request.args).toEqual({
      count: "42",
      paginationOpts: { numItems: 2, cursor: null },
    });
  });

  test("is LoadingFirstPage until the first page loads, and when skipped", () => {
    const { result } = renderHook(() =>
      useStreamPaginatedQuery(list, {}, { initialNumItems: 2 }),
    );
    assert(result.current._tag === "LoadingFirstPage");
    expect(result.current.skipped).toBe(false);

    const { result: skipped } = renderHook(() =>
      useStreamPaginatedQuery(list, "skip", { initialNumItems: 2 }),
    );
    assert(skipped.current._tag === "LoadingFirstPage");
    expect(skipped.current.skipped).toBe(true);
    expect(subscribedOpts()).toEqual([]);
  });

  test("loadMore pins the previous page at its continue cursor", () => {
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
    assert(result.current._tag === "CanLoadMore");
    act(() => {
      assert(result.current._tag === "CanLoadMore");
      result.current.loadMore(2);
    });

    // The growing page stays rendered while its pinned replacement and the
    // new page load.
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null },
      { numItems: 2, cursor: null, endCursor: "c0" },
      { numItems: 2, cursor: "c0" },
    ]);
    const whileLoading = current(result);
    assert(whileLoading._tag === "LoadingMore");
    expect(whileLoading.results).toEqual([{ value: 1 }, { value: 2 }]);

    respond(
      { numItems: 2, cursor: null, endCursor: "c0" },
      {
        page: [{ value: "1" }, { value: "2" }],
        isDone: false,
        continueCursor: "c0",
      },
    );
    respond(
      { numItems: 2, cursor: "c0" },
      { page: [{ value: "3" }], isDone: true, continueCursor: "c1" },
    );
    rerender();

    // Both replacements loaded: the original page is swapped out.
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null, endCursor: "c0" },
      { numItems: 2, cursor: "c0" },
    ]);
    const afterSwap = current(result);
    assert(afterSwap._tag === "Exhausted");
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

    // The overgrown page keeps rendering while its two halves load.
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null },
      { numItems: 2, cursor: null, endCursor: "s" },
      { numItems: 2, cursor: "s", endCursor: "c0" },
    ]);
    const whileSplitting = current(result);
    assert(whileSplitting._tag === "LoadingMore");
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
    assert(afterSplit._tag === "CanLoadMore");
    expect(afterSplit.results).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
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

    // The incomplete page's items are withheld while its halves load.
    assert(result.current._tag === "LoadingFirstPage");
    expect(subscribedOpts()).toEqual([
      { numItems: 2, cursor: null },
      { numItems: 2, cursor: null, endCursor: "s" },
      { numItems: 2, cursor: "s", endCursor: "c0" },
    ]);
  });

  test("returns a decoded typed error as Failure with the loaded pages", () => {
    respond(
      { numItems: 2, cursor: null },
      {
        page: [{ value: "1" }],
        isDone: false,
        continueCursor: "c0",
      },
    );

    const { result, rerender } = renderHook(() =>
      useStreamPaginatedQuery(listOrFail, {}, { initialNumItems: 2 }),
    );
    act(() => {
      assert(result.current._tag === "CanLoadMore");
      result.current.loadMore(2);
    });
    respond(
      { numItems: 2, cursor: null, endCursor: "c0" },
      { page: [{ value: "1" }], isDone: false, continueCursor: "c0" },
    );
    respond(
      { numItems: 2, cursor: "c0" },
      new ConvexError({ _tag: "Boom", reason: "nope" }),
    );
    rerender();

    assert(result.current._tag === "Failure");
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
    act(() => {
      assert(result.current._tag === "CanLoadMore");
      result.current.loadMore(2);
    });
    respond(
      { numItems: 2, cursor: null, endCursor: "c0" },
      { page: [{ value: "1" }], isDone: false, continueCursor: "c0" },
    );
    respond(
      { numItems: 2, cursor: "c0" },
      new Error("InvalidCursor: the query changed"),
    );
    rerender();

    // Back to a single growing first page, which reloads from the start.
    expect(subscribedOpts()).toEqual([{ numItems: 2, cursor: null }]);
    assert(result.current._tag === "CanLoadMore");
    expect(result.current.results).toEqual([{ value: 1 }, { value: 2 }]);
  });
});
