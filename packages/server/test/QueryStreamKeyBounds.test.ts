import * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";

describe("QueryStreamKeyBounds", () => {
  it.each([true, false])("maps inclusive=%s bounds to cuts", (inclusive) => {
    const key = ["a"];
    expect(QueryStreamKeyBounds.exactCut(key)).toEqual({ key, kind: "exact" });
    expect(QueryStreamKeyBounds.lowerCut({ key, inclusive })).toEqual({
      key,
      kind: inclusive ? "predecessor" : "successor",
    });
    expect(QueryStreamKeyBounds.upperCut({ key, inclusive })).toEqual({
      key,
      kind: inclusive ? "successor" : "predecessor",
    });
  });

  it("orders cuts around every extension of a prefix in both directions", () => {
    const cuts: ReadonlyArray<QueryStreamKeyBounds.KeyCut> = [
      { key: [], kind: "predecessor" },
      { key: ["a"], kind: "predecessor" },
      { key: ["a", 1], kind: "predecessor" },
      { key: ["a", 1], kind: "exact" },
      { key: ["a", 1], kind: "successor" },
      { key: ["a", 2], kind: "exact" },
      { key: ["a"], kind: "successor" },
      { key: ["b"], kind: "predecessor" },
      { key: [], kind: "successor" },
    ];
    for (const [leftIndex, left] of cuts.entries()) {
      for (const [rightIndex, right] of cuts.entries()) {
        expect(QueryStreamKeyBounds.KeyCutOrder(left, right)).toBe(
          leftIndex === rightIndex ? 0 : leftIndex < rightIndex ? -1 : 1,
        );
      }
    }
  });

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

  it("combines absent bounds and intersects present bounds with the supplied operation", () => {
    const first = Option.some({ key: [1], inclusive: true });
    const second = Option.some({ key: [2], inclusive: false });
    const none = Option.none<QueryStreamKeyBounds.KeyBound>();
    expect(
      QueryStreamKeyBounds.combineKeyBound(
        none,
        none,
        QueryStreamKeyBounds.tightestLower,
      ),
    ).toEqual(none);
    expect(
      QueryStreamKeyBounds.combineKeyBound(
        none,
        first,
        QueryStreamKeyBounds.tightestLower,
      ),
    ).toBe(first);
    expect(
      QueryStreamKeyBounds.combineKeyBound(
        first,
        none,
        QueryStreamKeyBounds.tightestLower,
      ),
    ).toEqual(first);
    expect(
      QueryStreamKeyBounds.combineKeyBound(
        first,
        second,
        QueryStreamKeyBounds.tightestLower,
      ),
    ).toEqual(second);
    expect(
      QueryStreamKeyBounds.combineKeyBound(
        first,
        second,
        QueryStreamKeyBounds.tightestUpper,
      ),
    ).toEqual(first);
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
