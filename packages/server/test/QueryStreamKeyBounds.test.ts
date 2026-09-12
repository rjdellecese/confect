import * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";

describe("QueryStreamKeyBounds", () => {
  it.each([true, false])(
    "admits the endpoint only for inclusive=%s bounds",
    (inclusive) => {
      const key = ["a"];
      const bound = Option.some({ key, inclusive });
      expect(QueryStreamKeyBounds.admittedByLower(bound)(key)).toBe(inclusive);
      expect(QueryStreamKeyBounds.admittedByUpper(bound)(key)).toBe(inclusive);
    },
  );

  it("orders bounds around every extension of a prefix in both directions", () => {
    const lowerBounds: ReadonlyArray<QueryStreamKeyBounds.KeyBound> = [
      { key: [], inclusive: true },
      { key: ["a"], inclusive: true },
      { key: ["a", 1], inclusive: true },
      { key: ["a", 1], inclusive: false },
      { key: ["a", 2], inclusive: true },
      { key: ["a", 2], inclusive: false },
      { key: ["a"], inclusive: false },
      { key: ["b"], inclusive: true },
      { key: [], inclusive: false },
    ];
    for (const [leftIndex, lower] of lowerBounds.entries()) {
      for (const [rightIndex, right] of lowerBounds.entries()) {
        const upper = { key: right.key, inclusive: !right.inclusive };
        expect(QueryStreamKeyBounds.isEmpty({ lower, upper })).toBe(
          leftIndex >= rightIndex,
        );
      }
      const upper = { key: lower.key, inclusive: !lower.inclusive };
      for (const [key, position] of [
        [["a", 1], 2.5],
        [["a", 2], 4.5],
      ] as const) {
        expect(
          QueryStreamKeyBounds.admittedByLower(Option.some(lower))(key),
        ).toBe(position > leftIndex);
        expect(
          QueryStreamKeyBounds.admittedByUpper(Option.some(upper))(key),
        ).toBe(position < leftIndex);
      }
    }
  });

  it.each([true, false])(
    "detects empty equal-key ranges with inclusive=%s lower bounds",
    (inclusive) => {
      const lower = { key: ["a"], inclusive };
      for (const upperInclusive of [true, false]) {
        const upper = { key: ["a"], inclusive: upperInclusive };
        expect(QueryStreamKeyBounds.isEmpty({ lower, upper })).toBe(
          !inclusive || !upperInclusive,
        );
      }
    },
  );

  it.each([true, false])(
    "admits the entire prefix family only for inclusive=%s endpoints",
    (inclusive) => {
      const bound = Option.some({ key: ["b"], inclusive });
      const lower = QueryStreamKeyBounds.admittedByLower(bound);
      const upper = QueryStreamKeyBounds.admittedByUpper(bound);
      for (const key of [["b"], ["b", 0], ["b", 99, "id"]]) {
        expect(lower(key)).toBe(inclusive);
        expect(upper(key)).toBe(inclusive);
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
      Option.some({ key: [], inclusive: true }),
    ]) {
      for (const key of [[], [undefined], ["a", 1]]) {
        expect(QueryStreamKeyBounds.admittedByLower(bound)(key)).toBe(true);
        expect(QueryStreamKeyBounds.admittedByUpper(bound)(key)).toBe(true);
      }
    }
    const excluded = Option.some({ key: [], inclusive: false });
    expect(QueryStreamKeyBounds.admittedByLower(excluded)(["a"])).toBe(false);
    expect(QueryStreamKeyBounds.admittedByUpper(excluded)(["a"])).toBe(false);
  });

  it("chooses the stricter lower and upper bounds independently of argument order", () => {
    const inclusive = { key: ["a"], inclusive: true };
    const exclusive = { key: ["a"], inclusive: false };
    const extension = { key: ["a", 1], inclusive: true };
    const later = { key: ["b"], inclusive: true };
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
    const first = Option.some({ key: [1], inclusive: true });
    const second = Option.some({ key: [2], inclusive: false });
    const none = Option.none<QueryStreamKeyBounds.KeyBound>();
    expect(
      QueryStreamKeyBounds.intersect(
        { lower: none, upper: none },
        { lower: none, upper: none },
      ),
    ).toEqual({ lower: none, upper: none });
    for (const [left, right] of [
      [none, first],
      [first, none],
    ]) {
      const result = QueryStreamKeyBounds.intersect(
        { lower: left, upper: left },
        { lower: right, upper: right },
      );
      expect(result).toEqual({ lower: first, upper: first });
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
        QueryStreamKeyBounds.intersect(
          { lower: left, upper: left },
          { lower: right, upper: right },
        ),
      ).toEqual({ lower: second, upper: first });
    }
    expect(
      QueryStreamKeyBounds.intersect(
        { lower: first, upper: none },
        { lower: none, upper: second },
      ),
    ).toEqual({ lower: first, upper: second });
  });

  it("intersects optional endpoints without mutating either range", () => {
    const first = Object.freeze({
      lower: Option.some({ key: [1], inclusive: true }),
      upper: Option.some({ key: [5], inclusive: true }),
    });
    const second = Object.freeze({
      lower: Option.some({ key: [2], inclusive: false }),
      upper: Option.some({ key: [4], inclusive: false }),
    });
    expect(QueryStreamKeyBounds.intersect(first, second)).toEqual(second);
    expect(QueryStreamKeyBounds.intersect(second, first)).toEqual(second);
  });

  it("intersects both endpoints without mutating either range", () => {
    const first = Object.freeze({
      lower: { key: [1], inclusive: true },
      upper: { key: [5], inclusive: true },
    });
    const second = Object.freeze({
      lower: { key: [2], inclusive: false },
      upper: { key: [4], inclusive: false },
    });
    expect(QueryStreamKeyBounds.intersectIndexBounds(first, second)).toEqual(
      second,
    );
    expect(QueryStreamKeyBounds.intersectIndexBounds(second, first)).toEqual(
      second,
    );
    const disjoint = {
      lower: { key: [6], inclusive: true },
      upper: { key: [7], inclusive: true },
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
