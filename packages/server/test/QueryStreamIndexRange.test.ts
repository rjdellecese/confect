import * as QueryStreamIndexRange from "@confect/server/QueryStreamIndexRange";
import * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type { GenericId } from "convex/values";

type Doc = {
  _id: GenericId<"items">;
  _creationTime: number;
  category: string;
  score: number;
  nested: { active: boolean };
};

const builder = () =>
  QueryStreamIndexRange.builder<Doc, ["category", "score", "_id"]>();

describe("QueryStreamIndexRange.builder", () => {
  it("preserves field tuple inference", () => {
    type Fields = readonly ["category", "_id"];
    type Builder<F extends ReadonlyArray<string>> =
      QueryStreamIndexRange.Builder<Doc, F>;
    expectTypeOf<
      Parameters<Builder<Fields>["eq"]>[0]
    >().toEqualTypeOf<"category">();
    expectTypeOf<
      QueryStreamIndexRange.Remaining<ReturnType<Builder<Fields>["eq"]>>
    >().toEqualTypeOf<["_id"]>();
    expectTypeOf<Parameters<Builder<[]>["eq"]>[0]>().toEqualTypeOf<never>();
    expectTypeOf<
      QueryStreamIndexRange.Remaining<ReturnType<Builder<["_id"]>["eq"]>>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Parameters<Builder<ReadonlyArray<string>>["eq"]>[0]
    >().toEqualTypeOf<never>();
    expectTypeOf<
      QueryStreamIndexRange.Remaining<
        ReturnType<Builder<ReadonlyArray<string>>["eq"]>
      >
    >().toEqualTypeOf<ReadonlyArray<string>>();
  });

  it("keeps branches independent and derives the equality prefix length", () => {
    const root = Object.freeze(builder());
    const pinned = Object.freeze(root.eq("category", "a"));
    const lower = pinned.gt("score", 1);
    const upper = pinned.lte("score", 5);
    expect(QueryStreamIndexRange.toBounds(root)).toEqual({
      lower: { key: [], inclusive: true },
      upper: { key: [], inclusive: true },
    });
    expect(QueryStreamIndexRange.toBounds(pinned)).toEqual({
      lower: { key: ["a"], inclusive: true },
      upper: { key: ["a"], inclusive: true },
    });
    expect(QueryStreamIndexRange.toBounds(lower)).toEqual({
      lower: { key: ["a", 1], inclusive: false },
      upper: { key: ["a"], inclusive: true },
    });
    expect(QueryStreamIndexRange.toBounds(upper)).toEqual({
      lower: { key: ["a"], inclusive: true },
      upper: { key: ["a", 5], inclusive: true },
    });
    for (const [range, length] of [
      [root, 0],
      [pinned, 1],
      [lower, 1],
      [upper, 1],
      [pinned.eq("score", 2), 2],
    ] as const) {
      expect(QueryStreamIndexRange.equalityPrefixLength(range)).toBe(length);
      const copied = { ...range, eqCount: 99 };
      expect(QueryStreamIndexRange.equalityPrefixLength(copied)).toBe(length);
      expect(range).not.toHaveProperty("eqCount");
    }
    expect(
      QueryStreamIndexRange.toBounds(root.eq("category", "b")).lower.key,
    ).toEqual(["b"]);
  });

  it("consumes equality fields while preserving bounded fields and their value types", () => {
    const root = builder();
    const pinned = root.eq("category", "a");
    const lower = pinned.gte("score", 1);
    const bounded = lower.lt("score", 5);
    expect(lower).not.toHaveProperty("eq");
    expect(lower).not.toHaveProperty("gt");
    expect(bounded).not.toHaveProperty("lt");
    const allPinned = pinned
      .eq("score", 2)
      .eq("_id", "item" as GenericId<"items">);
    expectTypeOf<QueryStreamIndexRange.Remaining<typeof root>>().toEqualTypeOf<
      ["category", "score", "_id"]
    >();
    expectTypeOf<
      QueryStreamIndexRange.Remaining<typeof pinned>
    >().toEqualTypeOf<["score", "_id"]>();
    expectTypeOf<QueryStreamIndexRange.Remaining<typeof lower>>().toEqualTypeOf<
      ["score", "_id"]
    >();
    expectTypeOf<
      QueryStreamIndexRange.Remaining<typeof bounded>
    >().toEqualTypeOf<["score", "_id"]>();
    expectTypeOf<
      QueryStreamIndexRange.Remaining<typeof allPinned>
    >().toEqualTypeOf<[]>();
    expectTypeOf(root.eq).parameters.toEqualTypeOf<
      [field: "category", value: string]
    >();
    expectTypeOf(pinned.gt).parameters.toEqualTypeOf<
      [field: "score", value: number]
    >();
    expectTypeOf(lower.lte).parameters.toEqualTypeOf<
      [field: "score", value: number]
    >();
    expectTypeOf<keyof typeof lower>().toEqualTypeOf<
      | keyof QueryStreamIndexRange.QueryStreamIndexRange<["score", "_id"]>
      | "lt"
      | "lte"
    >();
    expectTypeOf(bounded).toEqualTypeOf<
      QueryStreamIndexRange.QueryStreamIndexRange<["score", "_id"]>
    >();
    expectTypeOf(allPinned.eq).parameter(0).toEqualTypeOf<never>();
    const nested = QueryStreamIndexRange.builder<Doc, ["nested.active"]>();
    expectTypeOf(nested.eq).parameters.toEqualTypeOf<
      [field: "nested.active", value: boolean]
    >();
  });
});

describe("QueryStreamIndexRange.apply", () => {
  it.each(["eq", "gt", "gte", "lt", "lte"] as const)(
    "applies %s with its receiver and preserves missing field values",
    (tag) => {
      for (const value of ["hello", undefined]) {
        const final = {};
        const calls: unknown[] = [];
        const receiver = {
          [tag](this: unknown, field: string, received: unknown) {
            calls.push(this, field, received);
            return final;
          },
        };
        const range = QueryStreamIndexRange.builder<
          Doc & { text?: string },
          ["text"]
        >()[tag]("text", value);
        expect(QueryStreamIndexRange.apply(range, receiver)).toBe(final);
        expect(calls).toEqual([receiver, "text", value]);
      }
    },
  );

  it("threads returned Convex builders through an equality prefix and both endpoints", () => {
    const calls: unknown[] = [];
    const final = {};
    const upper = {
      lte(field: string, value: unknown) {
        calls.push(["lte", field, value]);
        return final;
      },
    };
    const lower = {
      gt(field: string, value: unknown) {
        calls.push(["gt", field, value]);
        return upper;
      },
    };
    const target = {
      eq(field: string, value: unknown) {
        calls.push(["eq", field, value]);
        return lower;
      },
    };
    expect(QueryStreamIndexRange.apply(builder(), target)).toBe(target);
    expect(calls).toEqual([]);
    expect(
      QueryStreamIndexRange.apply(
        builder().eq("category", "a").gt("score", 1).lte("score", 5),
        target,
      ),
    ).toBe(final);
    expect(calls).toEqual([
      ["eq", "category", "a"],
      ["gt", "score", 1],
      ["lte", "score", 5],
    ]);
  });
});

describe("QueryStreamIndexRange.toBounds", () => {
  it("keeps an unconstrained range unbounded and pins equalities on both endpoints", () => {
    expect(QueryStreamIndexRange.toBounds(builder())).toEqual({
      lower: { key: [], inclusive: true },
      upper: { key: [], inclusive: true },
    });
    expect(
      QueryStreamIndexRange.toBounds(
        builder().eq("category", "a").eq("score", 2),
      ),
    ).toEqual({
      lower: { key: ["a", 2], inclusive: true },
      upper: { key: ["a", 2], inclusive: true },
    });
  });

  it.each(["gt", "gte"] as const)(
    "folds %s and each upper-bound variant onto the equality prefix",
    (lowerTag) => {
      const lower = builder().eq("category", "a")[lowerTag]("score", 1);
      expect(QueryStreamIndexRange.toBounds(lower)).toEqual({
        lower: { key: ["a", 1], inclusive: lowerTag === "gte" },
        upper: { key: ["a"], inclusive: true },
      });
      for (const upperTag of ["lt", "lte"] as const) {
        expect(
          QueryStreamIndexRange.toBounds(lower[upperTag]("score", 5)),
        ).toEqual({
          lower: { key: ["a", 1], inclusive: lowerTag === "gte" },
          upper: { key: ["a", 5], inclusive: upperTag === "lte" },
        });
        expect(
          QueryStreamIndexRange.toBounds(
            builder().eq("category", "a")[upperTag]("score", 5),
          ),
        ).toEqual({
          lower: { key: ["a"], inclusive: true },
          upper: { key: ["a", 5], inclusive: upperTag === "lte" },
        });
      }
    },
  );
});

describe("QueryStreamIndexRange.fromBounds", () => {
  it.each(["asc", "desc"] as const)(
    "decomposes a compound interval in %s order",
    (order) => {
      const bounds = {
        lower: { key: [1, 2, 3], inclusive: false },
        upper: { key: [1, 3, 2], inclusive: true },
      };
      const expected = [
        {
          lower: { key: [1, 2, 3], inclusive: false },
          upper: { key: [1, 2], inclusive: true },
        },
        {
          lower: { key: [1, 2], inclusive: false },
          upper: { key: [1, 3], inclusive: false },
        },
        {
          lower: { key: [1, 3], inclusive: true },
          upper: { key: [1, 3, 2], inclusive: true },
        },
      ];
      const ranges = QueryStreamIndexRange.fromBounds(
        ["f1", "f2", "f3"],
        order,
        bounds,
      );
      expectTypeOf(ranges).toEqualTypeOf<
        ReadonlyArray<QueryStreamIndexRange.QueryStreamIndexRange>
      >();
      expect(ranges.map(QueryStreamIndexRange.toBounds)).toEqual(
        order === "asc" ? expected : expected.toReversed(),
      );
      expect(ranges.map(QueryStreamIndexRange.equalityPrefixLength)).toEqual([
        2, 1, 2,
      ]);
    },
  );

  it("preserves unconstrained, equality-only, and one-sided ranges", () => {
    const pinned = builder().eq("category", "a");
    for (const range of [
      builder(),
      pinned,
      pinned.gt("score", 2),
      pinned.gte("score", 2),
      pinned.lt("score", 2),
      pinned.lte("score", 2),
    ]) {
      const bounds = QueryStreamIndexRange.toBounds(range);
      const ranges = QueryStreamIndexRange.fromBounds(
        ["category", "score", "_id"],
        "asc",
        bounds,
      );
      expect(ranges.map(QueryStreamIndexRange.toBounds)).toEqual([bounds]);
      expect(ranges.map(QueryStreamIndexRange.equalityPrefixLength)).toEqual([
        QueryStreamIndexRange.equalityPrefixLength(range),
      ]);
    }
  });

  it.each(["asc", "desc"] as const)(
    "partitions every tested prefix interval exactly once and in %s order",
    (order) => {
      const keys = [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ];
      const ordered = order === "asc" ? keys : keys.toReversed();
      const endpoints = [[], [0], [1], ...keys].flatMap((key) =>
        [true, false].map((inclusive) => ({ key, inclusive })),
      );
      const admits =
        (bounds: QueryStreamKeyBounds.IndexBounds) =>
        (key: ReadonlyArray<number>) =>
          QueryStreamKeyBounds.admittedByLower(Option.some(bounds.lower))(
            key,
          ) &&
          QueryStreamKeyBounds.admittedByUpper(Option.some(bounds.upper))(key);
      for (const lower of endpoints)
        for (const upper of endpoints) {
          const bounds = { lower, upper };
          const ranges = QueryStreamIndexRange.fromBounds(
            ["a", "b"],
            order,
            bounds,
          );
          expect(
            ranges.flatMap((range) =>
              ordered.filter(admits(QueryStreamIndexRange.toBounds(range))),
            ),
          ).toEqual(ordered.filter(admits(bounds)));
        }
    },
  );

  it.each(["asc", "desc"] as const)(
    "returns no segments for reversed or empty ranges in %s order",
    (order) => {
      const cases: ReadonlyArray<QueryStreamKeyBounds.IndexBounds> = [
        {
          lower: { key: [2], inclusive: true },
          upper: { key: [1], inclusive: true },
        },
        {
          lower: { key: [1], inclusive: false },
          upper: { key: [1], inclusive: true },
        },
        {
          lower: { key: [1], inclusive: true },
          upper: { key: [1], inclusive: false },
        },
        {
          lower: { key: [1], inclusive: false },
          upper: { key: [1], inclusive: false },
        },
        {
          lower: { key: [1], inclusive: false },
          upper: { key: [1, 2], inclusive: true },
        },
        {
          lower: { key: [1, 2], inclusive: true },
          upper: { key: [1], inclusive: false },
        },
        {
          lower: { key: [], inclusive: false },
          upper: { key: [], inclusive: true },
        },
      ];
      for (const bounds of cases) {
        expect(
          QueryStreamIndexRange.fromBounds(["score", "_id"], order, bounds),
        ).toEqual([]);
      }
    },
  );
});
