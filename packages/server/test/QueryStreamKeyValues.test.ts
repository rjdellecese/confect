import * as QueryStreamKeyValues from "@confect/server/QueryStreamKeyValues";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { compareValues } from "convex/values";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("QueryStreamKeyValues", () => {
  it("round-trips native key values through its JSON codec", () => {
    const values: QueryStreamKeyValues.QueryStreamKeyValues = [
      undefined,
      null,
      true,
      "text",
      1,
      42n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      new Uint8Array([1, 2]).buffer,
      ["nested"],
      { nested: "value" },
    ];
    const Json = Schema.fromJsonString(
      QueryStreamKeyValues.QueryStreamKeyValues,
    );
    const encoded = Schema.encodeResult(Json)(values).pipe(Result.getOrThrow);
    expect(Schema.decodeResult(Json)(encoded).pipe(Result.getOrThrow)).toEqual(
      values,
    );
    expect(
      Schema.decodeResult(
        Schema.Json.pipe(Schema.Array, Schema.fromJsonString),
      )(encoded).pipe(Result.getOrThrow)[0],
    ).toEqual({ $undefined: true });
    expectTypeOf<QueryStreamKeyValues.QueryStreamKeyValues>().toEqualTypeOf<
      ReadonlyArray<QueryStreamKeyValues.KeyValue>
    >();
  });

  it.each<Record<string, boolean | number | string>>([
    { $undefined: false },
    { $undefined: true, extra: 1 },
    { $integer: "invalid" },
  ])("rejects malformed JSON key values: %j", (value) => {
    expect(
      Result.isFailure(
        Schema.decodeResult(QueryStreamKeyValues.QueryStreamKeyValues)([value]),
      ),
    ).toBe(true);
  });

  it("uses Convex ordering for individual values", () => {
    const values: QueryStreamKeyValues.QueryStreamKeyValues = [
      undefined,
      null,
      -1,
      0,
      1,
      Number.NaN,
      42n,
      false,
      true,
      "a",
      "b",
      [1],
      { a: 1 },
    ];
    for (const left of values) {
      for (const right of values) {
        expect(QueryStreamKeyValues.ValueOrder(left, right)).toBe(
          Math.sign(compareValues(left, right)),
        );
      }
    }
  });

  it.each([
    [-0, 0, -1],
    [0, -0, 1],
  ] as const)(
    "distinguishes signed zeros in native order (case %#)",
    (left, right, expected) => {
      expect(compareValues(left, right)).toBe(expected);
      expect(QueryStreamKeyValues.ValueOrder(left, right)).toBe(expected);
    },
  );

  it("normalizes native comparison magnitudes", () => {
    expect(compareValues("a", "c")).toBeLessThan(-1);
    expect(QueryStreamKeyValues.ValueOrder("a", "c")).toBe(-1);
    expect(QueryStreamKeyValues.ValueOrder("c", "a")).toBe(1);
  });

  it.each(["asc", "desc"] as const)(
    "preserves signed-zero ordering through key arrays in %s order",
    (direction) => {
      const negative: QueryStreamKeyValues.QueryStreamKeyValues = [
        "prefix",
        -0,
        "z",
      ];
      const positive: QueryStreamKeyValues.QueryStreamKeyValues = [
        "prefix",
        0,
        "a",
      ];
      const order = QueryStreamKeyValues.Order(direction);
      expect(order(negative, positive)).toBe(direction === "asc" ? -1 : 1);
      expect(order(positive, negative)).toBe(direction === "asc" ? 1 : -1);
      expect(order(negative, negative)).toBe(0);
      expect(order(negative, ["prefix", -0, "z"])).toBe(0);
      expect(order(positive, ["prefix", 0, "a"])).toBe(0);
      expect(negative).toEqual(["prefix", -0, "z"]);
      expect(positive).toEqual(["prefix", 0, "a"]);
    },
  );

  it("requires a direction and compares keys lexicographically", () => {
    expectTypeOf(QueryStreamKeyValues.Order).parameters.toEqualTypeOf<
      [orderDirection: "asc" | "desc"]
    >();
    expect(QueryStreamKeyValues.Order("asc")(["a", 1], ["a", 2])).toBe(-1);
    expect(QueryStreamKeyValues.Order("asc")(["a"], ["a", 1])).toBe(-1);
    expect(QueryStreamKeyValues.Order("asc")(["b"], ["a", 2])).toBe(1);
    expect(QueryStreamKeyValues.Order("asc")([], [])).toBe(0);
    expect(QueryStreamKeyValues.Order("asc")(["a"], ["b"])).toBe(-1);
    expect(QueryStreamKeyValues.Order("desc")(["a"], ["b"])).toBe(1);
  });

  it("extracts nested values and retains missing fields", () => {
    expect(
      QueryStreamKeyValues.extract({ nested: { score: 2 }, _id: "n1" }, [
        ["nested", "score"],
        ["missing", "field"],
        ["_id"],
      ]),
    ).toEqual([2, undefined, "n1"]);
    expect(QueryStreamKeyValues.extract({}, [])).toEqual([]);
  });
});
