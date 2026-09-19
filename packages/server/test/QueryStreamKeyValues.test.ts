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
      Schema.toCodecJson(QueryStreamKeyValues.QueryStreamKeyValues),
    );
    const encoded = Schema.encodeSync(Json)(values);
    expect(Schema.decodeSync(Json)(encoded)).toEqual(values);
    expect(JSON.parse(encoded)[0]).toEqual({ $undefined: true });
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
        Schema.decodeResult(
          Schema.toCodecJson(QueryStreamKeyValues.QueryStreamKeyValues),
        )([value]),
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
