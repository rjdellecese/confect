import * as QueryStreamIndexPrefix from "@confect/server/QueryStreamIndexPrefix";
import * as QueryStreamIndexRange from "@confect/server/QueryStreamIndexRange";
import * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type {
  IndexRange as ConvexIndexRange,
  IndexRangeBuilder as ConvexIndexRangeBuilder,
  GenericDocument,
} from "convex/server";
import type { KeyValue } from "@confect/server/QueryStreamKeyValues";
import * as Result from "effect/Result";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import type { GenericId } from "convex/values";

const fromBounds = (
  ...args: Parameters<typeof QueryStreamIndexRange.fromBounds>
) => Result.getOrThrow(QueryStreamIndexRange.fromBounds(...args));

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
      lower: { orderKey: [], inclusive: true },
      upper: { orderKey: [], inclusive: true },
    });
    expect(QueryStreamIndexRange.toBounds(pinned)).toEqual({
      lower: { orderKey: ["a"], inclusive: true },
      upper: { orderKey: ["a"], inclusive: true },
    });
    expect(QueryStreamIndexRange.toBounds(lower)).toEqual({
      lower: { orderKey: ["a", 1], inclusive: false },
      upper: { orderKey: ["a"], inclusive: true },
    });
    expect(QueryStreamIndexRange.toBounds(upper)).toEqual({
      lower: { orderKey: ["a"], inclusive: true },
      upper: { orderKey: ["a", 5], inclusive: true },
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
      QueryStreamIndexRange.toBounds(root.eq("category", "b")).lower.orderKey,
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
  type Call = readonly [
    tag: "eq" | "gt" | "gte" | "lt" | "lte",
    fieldPath: string,
    value: KeyValue,
  ];

  class RecordedRange {
    constructor(readonly calls: ReadonlyArray<Call> = []) {}
  }

  class UpperBuilder extends RecordedRange {
    lt(fieldPath: string, value: KeyValue): RecordedRange {
      return new RecordedRange([...this.calls, ["lt", fieldPath, value]]);
    }
    lte(fieldPath: string, value: KeyValue): RecordedRange {
      return new RecordedRange([...this.calls, ["lte", fieldPath, value]]);
    }
  }

  class RecordingBuilder extends UpperBuilder {
    eq(fieldPath: string, value: KeyValue): RecordingBuilder {
      return new RecordingBuilder([...this.calls, ["eq", fieldPath, value]]);
    }
    gt(fieldPath: string, value: KeyValue): UpperBuilder {
      return new UpperBuilder([...this.calls, ["gt", fieldPath, value]]);
    }
    gte(fieldPath: string, value: KeyValue): UpperBuilder {
      return new UpperBuilder([...this.calls, ["gte", fieldPath, value]]);
    }
  }

  // Convex exports IndexRange only as a type; the recording fixture supplies
  // its behavior without access to the SDK's private nominal marker.
  const recordingBuilder = () =>
    new RecordingBuilder() as RecordingBuilder &
      ConvexIndexRangeBuilder<GenericDocument, string[]>;

  it.each(["eq", "gt", "gte", "lt", "lte"] as const)(
    "applies %s with its receiver and preserves missing field values",
    (tag) => {
      for (const value of ["hello", undefined]) {
        const receiver = recordingBuilder();
        const range = QueryStreamIndexRange.builder<
          Doc & { text?: string },
          ["text"]
        >()[tag]("text", value);
        const result = QueryStreamIndexRange.apply(range, receiver);
        expectTypeOf(result).toEqualTypeOf<ConvexIndexRange>();
        expectTypeOf(QueryStreamIndexRange.apply)
          .parameter(1)
          .toEqualTypeOf<ConvexIndexRangeBuilder<GenericDocument, string[]>>();
        expect(result).toHaveProperty("calls", [[tag, "text", value]]);
        expect(result).not.toBe(receiver);
        expect(receiver.calls).toEqual([]);
      }
    },
  );

  it("threads returned Convex builders through an equality prefix and both endpoints", () => {
    const target = recordingBuilder();
    expect(QueryStreamIndexRange.apply(builder(), target)).toBe(target);
    expect(target.calls).toEqual([]);
    const result = QueryStreamIndexRange.apply(
      builder()
        .eq("category", "a")
        .eq("score", 1)
        .gt("_id", "first" as GenericId<"items">)
        .lte("_id", "last" as GenericId<"items">),
      target,
    );
    expect(result).toEqual(
      new RecordedRange([
        ["eq", "category", "a"],
        ["eq", "score", 1],
        ["gt", "_id", "first"],
        ["lte", "_id", "last"],
      ]),
    );
    expect(target.calls).toEqual([]);
  });
});

describe("QueryStreamIndexRange.toBounds", () => {
  it("keeps an unconstrained range unbounded and pins equalities on both endpoints", () => {
    expect(QueryStreamIndexRange.toBounds(builder())).toEqual({
      lower: { orderKey: [], inclusive: true },
      upper: { orderKey: [], inclusive: true },
    });
    expect(
      QueryStreamIndexRange.toBounds(
        builder().eq("category", "a").eq("score", 2),
      ),
    ).toEqual({
      lower: { orderKey: ["a", 2], inclusive: true },
      upper: { orderKey: ["a", 2], inclusive: true },
    });
  });

  it.each(["gt", "gte"] as const)(
    "folds %s and each upper-bound variant onto the equality prefix",
    (lowerTag) => {
      const lower = builder().eq("category", "a")[lowerTag]("score", 1);
      expect(QueryStreamIndexRange.toBounds(lower)).toEqual({
        lower: { orderKey: ["a", 1], inclusive: lowerTag === "gte" },
        upper: { orderKey: ["a"], inclusive: true },
      });
      for (const upperTag of ["lt", "lte"] as const) {
        expect(
          QueryStreamIndexRange.toBounds(lower[upperTag]("score", 5)),
        ).toEqual({
          lower: { orderKey: ["a", 1], inclusive: lowerTag === "gte" },
          upper: { orderKey: ["a", 5], inclusive: upperTag === "lte" },
        });
        expect(
          QueryStreamIndexRange.toBounds(
            builder().eq("category", "a")[upperTag]("score", 5),
          ),
        ).toEqual({
          lower: { orderKey: ["a"], inclusive: true },
          upper: { orderKey: ["a", 5], inclusive: upperTag === "lte" },
        });
      }
    },
  );
});

describe("QueryStreamIndexRange.fromBounds", () => {
  it("returns a named error when either bound exceeds the index width", () => {
    for (const [lower, upper] of [
      [[3, "id"], []],
      [[], [3, "id"]],
    ] as const) {
      const split = QueryStreamIndexRange.fromBounds(["score"], "asc", {
        lower: { orderKey: lower, inclusive: true },
        upper: { orderKey: upper, inclusive: true },
      });
      expect(split).toEqual(
        Result.fail(
          new QueryStreamIndexPrefix.IndexPrefixWidthMismatchError({
            width: 1,
            actual: 2,
          }),
        ),
      );
    }
  });

  it.each(["asc", "desc"] as const)(
    "decomposes a compound interval in %s order",
    (order) => {
      const bounds = {
        lower: { orderKey: [1, 2, 3], inclusive: false },
        upper: { orderKey: [1, 3, 2], inclusive: true },
      };
      const expected = [
        {
          lower: { orderKey: [1, 2, 3], inclusive: false },
          upper: { orderKey: [1, 2], inclusive: true },
        },
        {
          lower: { orderKey: [1, 2], inclusive: false },
          upper: { orderKey: [1, 3], inclusive: false },
        },
        {
          lower: { orderKey: [1, 3], inclusive: true },
          upper: { orderKey: [1, 3, 2], inclusive: true },
        },
      ];
      const ranges = fromBounds(["f1", "f2", "f3"], order, bounds);
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
      const ranges = fromBounds(["category", "score", "_id"], "asc", bounds);
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
      const endpoints = [[], [0], [1], ...keys].flatMap((orderKey) =>
        [true, false].map((inclusive) => ({ orderKey, inclusive })),
      );
      const layout = Result.getOrThrow(Layout.fromIndex(["a", "_id"]));
      const admits = (bounds: QueryStreamKeyBounds.IndexBounds) => {
        const parsed = Result.getOrThrow(
          QueryStreamKeyBounds.parse(layout, {
            lower: Option.some(bounds.lower),
            upper: Option.some(bounds.upper),
          }),
        );
        return (values: ReadonlyArray<number>) => {
          const key = Result.getOrThrow(Key.complete(layout, values));
          return (
            Result.getOrThrow(
              QueryStreamKeyBounds.admittedByLower(parsed)(key),
            ) &&
            Result.getOrThrow(QueryStreamKeyBounds.admittedByUpper(parsed)(key))
          );
        };
      };
      for (const lower of endpoints)
        for (const upper of endpoints) {
          const bounds = { lower, upper };
          const ranges = fromBounds(["a", "b"], order, bounds);
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
          lower: { orderKey: [2], inclusive: true },
          upper: { orderKey: [1], inclusive: true },
        },
        {
          lower: { orderKey: [1], inclusive: false },
          upper: { orderKey: [1], inclusive: true },
        },
        {
          lower: { orderKey: [1], inclusive: true },
          upper: { orderKey: [1], inclusive: false },
        },
        {
          lower: { orderKey: [1], inclusive: false },
          upper: { orderKey: [1], inclusive: false },
        },
        {
          lower: { orderKey: [1], inclusive: false },
          upper: { orderKey: [1, 2], inclusive: true },
        },
        {
          lower: { orderKey: [1, 2], inclusive: true },
          upper: { orderKey: [1], inclusive: false },
        },
        {
          lower: { orderKey: [], inclusive: false },
          upper: { orderKey: [], inclusive: true },
        },
      ];
      for (const bounds of cases) {
        expect(fromBounds(["score", "_id"], order, bounds)).toEqual([]);
      }
    },
  );
});
