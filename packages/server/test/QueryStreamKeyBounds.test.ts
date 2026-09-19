import * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import * as Labels from "@confect/server/QueryStreamKeyLabels";
import * as Result from "effect/Result";
import type * as QueryStreamKeyValues from "@confect/server/QueryStreamKeyValues";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";

const admits =
  (side: "lower" | "upper") =>
  (bound: Option.Option<QueryStreamKeyBounds.KeyBound>) =>
  (values: QueryStreamKeyValues.QueryStreamKeyValues) => {
    const layout = Result.getOrThrow(
      Layout.fromIndex(Array.from({ length: values.length }, () => "_id")),
    );
    // An empty explicit layout has no implicit ID.
    const actualLayout =
      values.length === 0
        ? Result.getOrThrow(Layout.fromIndex(["_id"], 1))
        : layout;
    const key = Result.getOrThrow(Key.complete(actualLayout, values));
    const bounds = Result.getOrThrow(
      QueryStreamKeyBounds.parse(actualLayout, {
        lower: side === "lower" ? bound : Option.none(),
        upper: side === "upper" ? bound : Option.none(),
      }),
    );
    return Result.getOrThrow(
      side === "lower"
        ? QueryStreamKeyBounds.admittedByLower(bounds)(key)
        : QueryStreamKeyBounds.admittedByUpper(bounds)(key),
    );
  };
const admittedByLower = admits("lower");
const admittedByUpper = admits("upper");
const boundLayout = Result.getOrThrow(Layout.fromIndex(["_id"]));
const parseBound = (bound: QueryStreamKeyBounds.KeyBound) =>
  Result.getOrThrow(QueryStreamKeyBounds.parseBound(boundLayout, bound));
const parsedBounds = (
  lower: Option.Option<QueryStreamKeyBounds.ParsedBound>,
  upper: Option.Option<QueryStreamKeyBounds.ParsedBound>,
) =>
  Result.getOrThrow(
    QueryStreamKeyBounds.fromParsed(boundLayout, { lower, upper }),
  );
const intersect = (
  self: QueryStreamKeyBounds.ParsedBounds,
  that: QueryStreamKeyBounds.ParsedBounds,
) => Result.getOrThrow(QueryStreamKeyBounds.intersect(self, that));

describe("QueryStreamKeyBounds", () => {
  const layout = Result.getOrThrow(Layout.fromIndex(["score"]));
  const bounded = Result.getOrThrow(
    QueryStreamKeyBounds.parse(layout, {
      lower: Option.some({ orderKey: [1, 1], inclusive: true }),
      upper: Option.some({ orderKey: [3, 3], inclusive: true }),
    }),
  );

  it("retains a layout even when both endpoints are absent", () => {
    const empty = QueryStreamKeyBounds.unbounded(layout);
    expect(empty.layout).toBe(layout);
    expect(empty.lower).toEqual(Option.none());
    expect(empty.upper).toEqual(Option.none());
    expectTypeOf<{
      readonly layout: Layout.QueryStreamKeyLayout;
      readonly lower: Option.Option<QueryStreamKeyBounds.ParsedBound>;
      readonly upper: Option.Option<QueryStreamKeyBounds.ParsedBound>;
    }>().not.toExtend<QueryStreamKeyBounds.ParsedBounds>();
  });

  it.each([
    {
      name: "different labels",
      actual: Result.getOrThrow(Layout.fromIndex(["rank"])),
    },
    {
      name: "different implicit ID positions",
      actual: Layout.concat(
        Result.getOrThrow(Layout.fromIndex([])),
        Result.getOrThrow(
          Layout.rename(
            Result.getOrThrow(Layout.fromIndex(["_id"])),
            Labels.make(["score"]),
          ),
        ),
      ),
    },
    {
      name: "different runtime widths",
      actual: Result.getOrThrow(Layout.fromIndex([])),
    },
  ])("rejects $name before combining or comparing keys", ({ actual }) => {
    const mismatch = (
      result: Result.Result<unknown, Layout.KeyLayoutMismatchError>,
    ) => {
      const error = Result.getOrThrow(Result.flip(result));
      expect(error).toBeInstanceOf(Layout.KeyLayoutMismatchError);
      expect(error.expected).toBe(layout);
      expect(error.actual).toBe(actual);
    };
    const key = Result.getOrThrow(
      Key.complete(
        actual,
        Array.from({ length: Layout.runtimeWidth(actual) }, () => 2),
      ),
    );
    const other = QueryStreamKeyBounds.unbounded(actual);
    mismatch(QueryStreamKeyBounds.forLayout(layout, other));
    for (const bounds of [bounded, QueryStreamKeyBounds.unbounded(layout)]) {
      mismatch(QueryStreamKeyBounds.admittedByLower(bounds)(key));
      mismatch(QueryStreamKeyBounds.admittedByUpper(bounds)(key));
      mismatch(QueryStreamKeyBounds.intersect(bounds, other));
    }
    const endpoint = { orderKey: Key.toPrefix(key), inclusive: true };
    for (const endpoints of [
      { lower: Option.some(endpoint), upper: Option.none() },
      { lower: Option.none(), upper: Option.some(endpoint) },
    ]) {
      mismatch(QueryStreamKeyBounds.fromParsed(layout, endpoints));
    }
    mismatch(
      QueryStreamKeyBounds.tightestParsedLower(
        Option.getOrThrow(bounded.lower),
        endpoint,
      ),
    );
    mismatch(
      QueryStreamKeyBounds.tightestParsedUpper(
        Option.getOrThrow(bounded.upper),
        endpoint,
      ),
    );
  });

  it("accepts equivalent layouts constructed separately and preserves parsed endpoints", () => {
    const equivalent = Result.getOrThrow(Layout.fromIndex(["score"]));
    expect(equivalent).not.toBe(layout);
    const key = Result.getOrThrow(Key.complete(equivalent, [2, 2]));
    const endpoint = { orderKey: Key.toPrefix(key), inclusive: true };
    const other = Result.getOrThrow(
      QueryStreamKeyBounds.fromParsed(layout, {
        lower: Option.some(endpoint),
        upper: Option.none(),
      }),
    );
    expect(Option.getOrThrow(other.lower)).toBe(endpoint);
    expect(
      Result.getOrThrow(QueryStreamKeyBounds.forLayout(equivalent, other)),
    ).toBe(other);
    expect(
      Result.getOrThrow(QueryStreamKeyBounds.admittedByLower(bounded)(key)),
    ).toBe(true);
    expect(
      Result.getOrThrow(QueryStreamKeyBounds.admittedByUpper(bounded)(key)),
    ).toBe(true);
    const combined = Result.getOrThrow(
      QueryStreamKeyBounds.intersect(
        QueryStreamKeyBounds.unbounded(equivalent),
        other,
      ),
    );
    expect(combined.layout).toBe(equivalent);
    expect(Option.getOrThrow(combined.lower)).toBe(endpoint);
    expect(
      Result.getOrThrow(
        QueryStreamKeyBounds.tightestParsedLower(
          Option.getOrThrow(bounded.lower),
          endpoint,
        ),
      ),
    ).toBe(endpoint);
    expect(
      Result.getOrThrow(
        QueryStreamKeyBounds.tightestParsedUpper(
          Option.getOrThrow(bounded.upper),
          endpoint,
        ),
      ),
    ).toBe(endpoint);
  });

  it.each([true, false])(
    "admits the endpoint only for inclusive=%s bounds",
    (inclusive) => {
      const orderKey = ["a"];
      const bound = Option.some({ orderKey: orderKey, inclusive });
      expect(admittedByLower(bound)(orderKey)).toBe(inclusive);
      expect(admittedByUpper(bound)(orderKey)).toBe(inclusive);
    },
  );

  it("orders bounds around every extension of a prefix in both directions", () => {
    const lowerBounds: ReadonlyArray<QueryStreamKeyBounds.KeyBound> = [
      { orderKey: [], inclusive: true },
      { orderKey: ["a"], inclusive: true },
      { orderKey: ["a", 1], inclusive: true },
      { orderKey: ["a", 1], inclusive: false },
      { orderKey: ["a", 2], inclusive: true },
      { orderKey: ["a", 2], inclusive: false },
      { orderKey: ["a"], inclusive: false },
      { orderKey: ["b"], inclusive: true },
      { orderKey: [], inclusive: false },
    ];
    for (const [leftIndex, lower] of lowerBounds.entries()) {
      for (const [rightIndex, right] of lowerBounds.entries()) {
        const upper = { orderKey: right.orderKey, inclusive: !right.inclusive };
        expect(QueryStreamKeyBounds.isEmpty({ lower, upper })).toBe(
          leftIndex >= rightIndex,
        );
      }
      const upper = { orderKey: lower.orderKey, inclusive: !lower.inclusive };
      for (const [orderKey, position] of [
        [["a", 1], 2.5],
        [["a", 2], 4.5],
      ] as const) {
        expect(admittedByLower(Option.some(lower))(orderKey)).toBe(
          position > leftIndex,
        );
        expect(admittedByUpper(Option.some(upper))(orderKey)).toBe(
          position < leftIndex,
        );
      }
    }
  });

  it.each([true, false])(
    "detects empty equal-key ranges with inclusive=%s lower bounds",
    (inclusive) => {
      const lower = { orderKey: ["a"], inclusive };
      for (const upperInclusive of [true, false]) {
        const upper = { orderKey: ["a"], inclusive: upperInclusive };
        expect(QueryStreamKeyBounds.isEmpty({ lower, upper })).toBe(
          !inclusive || !upperInclusive,
        );
      }
    },
  );

  it.each([true, false])(
    "admits the entire prefix family only for inclusive=%s endpoints",
    (inclusive) => {
      const bound = Option.some({ orderKey: ["b"], inclusive });
      const lower = admittedByLower(bound);
      const upper = admittedByUpper(bound);
      for (const orderKey of [["b"], ["b", 0], ["b", 99, "id"]]) {
        expect(lower(orderKey)).toBe(inclusive);
        expect(upper(orderKey)).toBe(inclusive);
      }
      expect(lower(["a", 99])).toBe(false);
      expect(lower(["c", 0])).toBe(true);
      expect(upper(["a", 99])).toBe(true);
      expect(upper(["c", 0])).toBe(false);
    },
  );

  it("treats absent and inclusive empty-prefix bounds as unbounded", () => {
    for (const bound of [
      Option.none(),
      Option.some({ orderKey: [], inclusive: true }),
    ]) {
      for (const orderKey of [[], [undefined], ["a", 1]]) {
        expect(admittedByLower(bound)(orderKey)).toBe(true);
        expect(admittedByUpper(bound)(orderKey)).toBe(true);
      }
    }
    const excluded = Option.some({ orderKey: [], inclusive: false });
    expect(admittedByLower(excluded)(["a"])).toBe(false);
    expect(admittedByUpper(excluded)(["a"])).toBe(false);
  });

  it("chooses the stricter lower and upper bounds independently of argument order", () => {
    const inclusive = { orderKey: ["a"], inclusive: true };
    const exclusive = { orderKey: ["a"], inclusive: false };
    const extension = { orderKey: ["a", 1], inclusive: true };
    const later = { orderKey: ["b"], inclusive: true };
    for (const [first, second, lower, upper] of [
      [inclusive, exclusive, exclusive, exclusive],
      [inclusive, extension, extension, extension],
      [exclusive, extension, exclusive, exclusive],
      [inclusive, later, later, inclusive],
    ] as const) {
      expect(QueryStreamKeyBounds.tightestLower(first, second)).toBe(lower);
      expect(QueryStreamKeyBounds.tightestLower(second, first)).toBe(lower);
      expect(QueryStreamKeyBounds.tightestUpper(first, second)).toBe(upper);
      expect(QueryStreamKeyBounds.tightestUpper(second, first)).toBe(upper);
    }
    const equal = { ...inclusive };
    expect(QueryStreamKeyBounds.tightestLower(inclusive, equal)).toBe(
      inclusive,
    );
    expect(QueryStreamKeyBounds.tightestUpper(inclusive, equal)).toBe(
      inclusive,
    );
  });

  it("combines absent bounds and intersects present bounds with the tightest endpoints", () => {
    const first = Option.some(parseBound({ orderKey: [1], inclusive: true }));
    const second = Option.some(parseBound({ orderKey: [2], inclusive: false }));
    const none = Option.none<QueryStreamKeyBounds.ParsedBound>();
    expect(
      intersect(parsedBounds(none, none), parsedBounds(none, none)),
    ).toEqual(parsedBounds(none, none));
    for (const [left, right] of [
      [none, first],
      [first, none],
    ]) {
      const result = intersect(
        parsedBounds(left, left),
        parsedBounds(right, right),
      );
      expect(result).toEqual(parsedBounds(first, first));
      if (Option.isNone(left)) {
        expect(result.lower).toBe(first);
        expect(result.upper).toBe(first);
      }
    }
    for (const [left, right] of [
      [first, second],
      [second, first],
    ]) {
      expect(
        intersect(parsedBounds(left, left), parsedBounds(right, right)),
      ).toEqual(parsedBounds(second, first));
    }
    expect(
      intersect(parsedBounds(first, none), parsedBounds(none, second)),
    ).toEqual(parsedBounds(first, second));
  });

  it("intersects optional endpoints without mutating either range", () => {
    const first = Object.freeze(
      parsedBounds(
        Option.some(parseBound({ orderKey: [1], inclusive: true })),
        Option.some(parseBound({ orderKey: [5], inclusive: true })),
      ),
    );
    const second = Object.freeze(
      parsedBounds(
        Option.some(parseBound({ orderKey: [2], inclusive: false })),
        Option.some(parseBound({ orderKey: [4], inclusive: false })),
      ),
    );
    expect(intersect(first, second)).toEqual(second);
    expect(intersect(second, first)).toEqual(second);
    const intersection = intersect(first, second);
    expect(Option.getOrThrow(intersection.lower)).toBe(
      Option.getOrThrow(second.lower),
    );
    expect(Option.getOrThrow(intersection.upper)).toBe(
      Option.getOrThrow(second.upper),
    );
  });

  it("intersects both endpoints without mutating either range", () => {
    const first = Object.freeze({
      lower: { orderKey: [1], inclusive: true },
      upper: { orderKey: [5], inclusive: true },
    });
    const second = Object.freeze({
      lower: { orderKey: [2], inclusive: false },
      upper: { orderKey: [4], inclusive: false },
    });
    expect(QueryStreamKeyBounds.intersectIndexBounds(first, second)).toEqual(
      second,
    );
    expect(QueryStreamKeyBounds.intersectIndexBounds(second, first)).toEqual(
      second,
    );
    const disjoint = {
      lower: { orderKey: [6], inclusive: true },
      upper: { orderKey: [7], inclusive: true },
    };
    expect(QueryStreamKeyBounds.intersectIndexBounds(first, disjoint)).toEqual({
      lower: disjoint.lower,
      upper: first.upper,
    });
    expect(QueryStreamKeyBounds.isEmpty(first)).toBe(false);
    expect(QueryStreamKeyBounds.isEmpty(second)).toBe(false);
    expect(
      QueryStreamKeyBounds.isEmpty(
        QueryStreamKeyBounds.intersectIndexBounds(first, disjoint),
      ),
    ).toBe(true);
  });

  it("requires at least one NarrowBounds endpoint", () => {
    type Bound = QueryStreamKeyBounds.KeyBound;
    type Narrow = QueryStreamKeyBounds.NarrowBounds;
    expectTypeOf<{ start: Bound }>().toExtend<Narrow>();
    expectTypeOf<{ end: Bound }>().toExtend<Narrow>();
    expectTypeOf<{ start: Bound; end: Bound }>().toExtend<Narrow>();
    expectTypeOf<{ start: Bound; end: undefined }>().toExtend<Narrow>();
    expectTypeOf<{ start: undefined; end: Bound }>().toExtend<Narrow>();
    expectTypeOf<{}>().not.toExtend<Narrow>();
    expectTypeOf<{ start: undefined; end: undefined }>().not.toExtend<Narrow>();
    expectTypeOf<{ start?: Bound; end?: Bound }>().not.toExtend<Narrow>();
  });
});
