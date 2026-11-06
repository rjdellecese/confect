import { expect, expectTypeOf, test } from "@effect/vitest";
import * as StreamPagination from "@confect/react/StreamPagination";

test("initializes page requests with optional read budgets", () => {
  expect(StreamPagination.initial(2).pages).toEqual({
    "0": { numItems: 2, cursor: null },
  });
  const budget = { maximumRowsRead: 100 };
  expect(StreamPagination.initial(2, budget).pages).toEqual({
    "0": { numItems: 2, cursor: null, maximumRowsRead: 100 },
  });
  expect(budget).toEqual({ maximumRowsRead: 100 });
});

test("keeps pin, split, and load-more transitions immutable", () => {
  const state = StreamPagination.initial(2);
  const pinned = StreamPagination.pin("0", "end")(state);
  const split = StreamPagination.split("0", "middle")(state);
  const more = StreamPagination.loadMore("end", 2)(state);
  expect(pinned.pages["1"]).toEqual({
    numItems: 2,
    cursor: null,
    endCursor: "end",
  });
  expect(split.pages["1"]).toEqual({
    numItems: 2,
    cursor: null,
    endCursor: "middle",
  });
  expect(split.pages["2"]).toEqual({ numItems: 2, cursor: "middle" });
  expect(more.pages["2"]).toEqual({ numItems: 2, cursor: "end" });
  expect(
    StreamPagination.loadMore("end", 2, { maximumBytesRead: 100 })(state).pages[
      "2"
    ],
  ).toEqual({ numItems: 2, cursor: "end", maximumBytesRead: 100 });
  expect(state).toEqual(StreamPagination.initial(2));
});

test("maps requests and interprets loaded page results", () => {
  const state = StreamPagination.initial(2);
  const requests = StreamPagination.pageRequests(state, (page) => page.cursor);
  expectTypeOf(requests).toEqualTypeOf<
    Readonly<Record<string, string | null>>
  >();
  expect(requests).toEqual({ "0": null });
  const results: StreamPagination.Results = {
    "0": { page: [1, 2], isDone: true, continueCursor: "end" },
  };
  const options = { initialNumItems: 2, isInvalidCursorError: () => false };
  const interpreted = StreamPagination.interpret(state, results, options);
  expect(interpreted._tag).toBe("Interpreted");
  if (interpreted._tag === "Interpreted") {
    expect(interpreted.items).toEqual([1, 2]);
    expect(interpreted.transitions).toHaveLength(1);
  }
});
