import * as QueryStreamIndexRange from "@confect/server/QueryStreamIndexRange";
import type * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { GenericId } from "convex/values";

type Doc = {
  _id: GenericId<"items">;
  _creationTime: number;
  category: string;
  score: number;
  nested: { active: boolean };
};

const builder = () =>
  QueryStreamIndexRange.rangeBuilder<Doc, ["category", "score", "_id"]>();

describe("QueryStreamIndexRange operations", () => {
  it.each(["eq", "gt", "gte", "lt", "lte"] as const)(
    "constructs %s operations with the existing record shape",
    (tag) => {
      const root = QueryStreamIndexRange.rangeBuilder<
        Doc & { text?: string },
        ["text"]
      >();
      for (const value of ["hello", undefined]) {
        expect(root[tag]("text", value).ops).toStrictEqual([
          { _tag: tag, field: "text", value },
        ]);
      }
    },
  );

  it("constructs precisely tagged operations", () => {
    const op = {
      _tag: "eq",
      field: "category",
      value: "hello",
    } satisfies QueryStreamIndexRange.RangeOp;
    expectTypeOf(op._tag).toEqualTypeOf<"eq">();
    expect(builder().eq("category", "hello").ops).toEqual([op]);
  });
});

describe("QueryStreamIndexRange.rangeBuilder", () => {
  it("preserves field tuple inference", () => {
    type Fields = readonly ["category", "_id"];
    type Builder<F extends ReadonlyArray<string>> =
      QueryStreamIndexRange.RangeBuilder<Doc, F>;
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

  it("returns independent branches without mutating a reused builder", () => {
    const root = Object.freeze(builder());
    Object.freeze(root.ops);
    const pinned = Object.freeze(root.eq("category", "a"));
    Object.freeze(pinned.ops);
    const lower = pinned.gt("score", 1);
    const upper = pinned.lte("score", 5);
    const other = root.eq("category", "b");
    expect(root.eqCount).toBe(0);
    expect(root.ops).toEqual([]);
    expect(pinned.eqCount).toBe(1);
    expect(pinned.ops).toEqual([{ _tag: "eq", field: "category", value: "a" }]);
    expect(lower.ops).toEqual([
      ...pinned.ops,
      { _tag: "gt", field: "score", value: 1 },
    ]);
    expect(upper.ops).toEqual([
      ...pinned.ops,
      { _tag: "lte", field: "score", value: 5 },
    ]);
    expect(other.ops).toEqual([{ _tag: "eq", field: "category", value: "b" }]);
    expect(lower.eqCount).toBe(1);
    expect(upper.eqCount).toBe(1);
    expect(pinned).not.toBe(root);
    expect(lower).not.toBe(pinned);
    expect(upper).not.toBe(lower);
    expect(pinned.eq("score", 2).eqCount).toBe(2);
  });

  it("derives an enumerable equality count from the leading operations", () => {
    const root = builder();
    const pinned = root.eq("category", "a").eq("score", 2);
    const id = "item" as GenericId<"items">;
    const lower = pinned.gt("_id", id);
    const bounded = lower.lte("_id", id);
    const expectedOps = [
      { _tag: "eq", field: "category", value: "a" },
      { _tag: "eq", field: "score", value: 2 },
    ];

    for (const [spec, expectedCount] of [
      [root, 0],
      [pinned, 2],
      [lower, 2],
      [bounded, 2],
      [pinned.eq("_id", id), 3],
    ] as const) {
      expect(spec.eqCount).toBe(expectedCount);
      expect({ ...spec }.eqCount).toBe(expectedCount);
      const descriptor = Object.getOwnPropertyDescriptor(spec, "eqCount");
      expect(descriptor).toMatchObject({
        enumerable: true,
        get: expect.any(Function),
      });
      expect(descriptor).not.toHaveProperty("value");
    }
    expect(root.ops).toEqual([]);
    expect(pinned.ops).toEqual(expectedOps);
    expect(lower.ops).toEqual([
      ...expectedOps,
      { _tag: "gt", field: "_id", value: id },
    ]);
    expect(bounded.ops).toEqual([
      ...expectedOps,
      { _tag: "gt", field: "_id", value: id },
      { _tag: "lte", field: "_id", value: id },
    ]);
  });

  it("consumes equality fields while preserving bounded fields and their value types", () => {
    const root = builder();
    const pinned = root.eq("category", "a");
    const lower = pinned.gte("score", 1);
    const bounded = lower.lt("score", 5);
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
      | keyof QueryStreamIndexRange.IndexRangeSpec<["score", "_id"]>
      | "lt"
      | "lte"
    >();
    expectTypeOf(bounded).toEqualTypeOf<
      QueryStreamIndexRange.IndexRangeSpec<["score", "_id"]>
    >();
    expectTypeOf(allPinned.eq).parameter(0).toEqualTypeOf<never>();
    const nested = QueryStreamIndexRange.rangeBuilder<Doc, ["nested.active"]>();
    expectTypeOf(nested.eq).parameters.toEqualTypeOf<
      [field: "nested.active", value: boolean]
    >();
  });
});

describe("QueryStreamIndexRange replay", () => {
  it.each(["eq", "gt", "gte", "lt", "lte"] as const)(
    "replays %s with its receiver, field, and value",
    (tag) => {
      const final = {};
      const calls: unknown[] = [];
      const receiver = {
        [tag](this: unknown, field: string, value: unknown) {
          calls.push(this, field, value);
          return final;
        },
      };
      const op: QueryStreamIndexRange.RangeOp = {
        _tag: tag,
        field: "score",
        value: undefined,
      };
      expect(QueryStreamIndexRange.applyOps([op], receiver)).toBe(final);
      expect(calls).toEqual([receiver, "score", undefined]);
    },
  );

  it("threads each returned builder through operations in order", () => {
    const spec = builder().eq("category", "a").gt("score", 1).lte("score", 5);
    const target = builder();
    const result = QueryStreamIndexRange.applyRange(spec, target);
    expect(result.ops).toEqual(spec.ops);
    expect(result.eqCount).toBe(1);
    expect(target.ops).toEqual([]);
    expect(QueryStreamIndexRange.applyOps([], target)).toBe(target);
    expect(QueryStreamIndexRange.applyRange(builder(), target)).toBe(target);
  });
});

describe("QueryStreamIndexRange.boundsFromSpec", () => {
  it("keeps an empty spec unbounded and pins equalities on both endpoints", () => {
    expect(QueryStreamIndexRange.boundsFromSpec(builder())).toEqual({
      lower: { key: [], inclusive: true },
      upper: { key: [], inclusive: true },
    });
    expect(
      QueryStreamIndexRange.boundsFromSpec(
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
      expect(QueryStreamIndexRange.boundsFromSpec(lower)).toEqual({
        lower: { key: ["a", 1], inclusive: lowerTag === "gte" },
        upper: { key: ["a"], inclusive: true },
      });
      for (const upperTag of ["lt", "lte"] as const) {
        expect(
          QueryStreamIndexRange.boundsFromSpec(lower[upperTag]("score", 5)),
        ).toEqual({
          lower: { key: ["a", 1], inclusive: lowerTag === "gte" },
          upper: { key: ["a", 5], inclusive: upperTag === "lte" },
        });
        expect(
          QueryStreamIndexRange.boundsFromSpec(
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

describe("QueryStreamIndexRange.splitRange", () => {
  it.each(["asc", "desc"] as const)(
    "decomposes a compound interval in %s order",
    (order) => {
      const bounds = {
        lower: { key: [1, 2, 3], inclusive: false },
        upper: { key: [1, 3, 2], inclusive: true },
      };
      const expected: ReadonlyArray<
        ReadonlyArray<QueryStreamIndexRange.RangeOp>
      > = [
        [
          { _tag: "eq", field: "f1", value: 1 },
          { _tag: "eq", field: "f2", value: 2 },
          { _tag: "gt", field: "f3", value: 3 },
        ],
        [
          { _tag: "eq", field: "f1", value: 1 },
          { _tag: "gt", field: "f2", value: 2 },
          { _tag: "lt", field: "f2", value: 3 },
        ],
        [
          { _tag: "eq", field: "f1", value: 1 },
          { _tag: "eq", field: "f2", value: 3 },
          { _tag: "lte", field: "f3", value: 2 },
        ],
      ];
      expect(
        QueryStreamIndexRange.splitRange(["f1", "f2", "f3"], order, bounds),
      ).toEqual(order === "asc" ? expected : expected.toReversed());
    },
  );

  it("represents unbounded and inclusive equal-prefix ranges with only equality operations", () => {
    expect(
      QueryStreamIndexRange.splitRange(
        ["category", "score"],
        "asc",
        QueryStreamIndexRange.boundsFromSpec(builder()),
      ),
    ).toEqual([[]]);
    expect(
      QueryStreamIndexRange.splitRange(
        ["category", "score"],
        "asc",
        QueryStreamIndexRange.boundsFromSpec(builder().eq("category", "a")),
      ),
    ).toEqual([[{ _tag: "eq", field: "category", value: "a" }]]);
  });

  it.each(["gt", "gte", "lt", "lte"] as const)(
    "preserves a one-sided %s range after an equality prefix",
    (tag) => {
      const spec = builder().eq("category", "a")[tag]("score", 2);
      expect(
        QueryStreamIndexRange.splitRange(
          ["category", "score", "_id"],
          "asc",
          QueryStreamIndexRange.boundsFromSpec(spec),
        ),
      ).toEqual([spec.ops]);
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
          QueryStreamIndexRange.splitRange(["score", "_id"], order, bounds),
        ).toEqual([]);
      }
    },
  );
});
