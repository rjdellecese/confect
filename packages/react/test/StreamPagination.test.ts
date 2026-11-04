import { expect, expectTypeOf, test } from "@effect/vitest";
import * as StreamPagination from "@confect/react/StreamPagination";

test("supports pipeable state initialization with optional read budgets", () => {
  expect(StreamPagination.initial()(2)).toEqual(StreamPagination.initial(2));
  const budget = { maximumRowsRead: 100 };
  expect(StreamPagination.initial(budget)(2)).toEqual(
    StreamPagination.initial(2, budget),
  );
  expect(budget).toEqual({ maximumRowsRead: 100 });
});

test("supports pipeable pin, split, and load-more transitions", () => {
  const state = StreamPagination.initial(2);
  const pinned = StreamPagination.pin("end")("0")(state);
  const split = StreamPagination.split("middle")("0")(state);
  const more = StreamPagination.loadMore(2)("end")(state);
  expect(pinned).toEqual(StreamPagination.pin("0", "end")(state));
  expect(split).toEqual(StreamPagination.split("0", "middle")(state));
  expect(more).toEqual(StreamPagination.loadMore("end", 2)(state));
  expect(
    StreamPagination.loadMore(2, { maximumBytesRead: 100 })("end")(state),
  ).toEqual(
    StreamPagination.loadMore("end", 2, { maximumBytesRead: 100 })(state),
  );
  expect(state).toEqual(StreamPagination.initial(2));
});

test("supports pipeable request mapping and result interpretation", () => {
  const state = StreamPagination.initial(2);
  const requests = StreamPagination.pageRequests((page) => page.cursor)(state);
  expectTypeOf(requests).toEqualTypeOf<
    Readonly<Record<string, string | null>>
  >();
  expect(requests).toEqual({ "0": null });
  const results: StreamPagination.Results = {
    "0": { page: [1, 2], isDone: true, continueCursor: "end" },
  };
  const options = { initialNumItems: 2, isInvalidCursorError: () => false };
  const interpreted = StreamPagination.interpret(results, options)(state);
  expect(interpreted._tag).toBe("Interpreted");
  if (interpreted._tag === "Interpreted") {
    expect(interpreted.items).toEqual([1, 2]);
    expect(interpreted.transitions).toHaveLength(1);
  }
});
