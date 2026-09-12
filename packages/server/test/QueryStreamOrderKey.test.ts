import * as QueryStreamOrderKey from "@confect/server/QueryStreamOrderKey";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { compareValues } from "convex/values";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("QueryStreamOrderKey", () => {
  it("round-trips native key values through its JSON codec", () => {
    const values: QueryStreamOrderKey.QueryStreamOrderKey = [
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
      Schema.toCodecJson(QueryStreamOrderKey.QueryStreamOrderKey),
    );
    const encoded = Schema.encodeSync(Json)(values);
    expect(Schema.decodeSync(Json)(encoded)).toEqual(values);
    expect(JSON.parse(encoded)[0]).toEqual({ $undefined: true });
    expectTypeOf<QueryStreamOrderKey.QueryStreamOrderKey>().toEqualTypeOf<
      ReadonlyArray<QueryStreamOrderKey.KeyValue>
    >();
  });

  it.each([
    { $undefined: false },
    { $undefined: true, extra: 1 },
    { $integer: "invalid" },
  ])("rejects malformed JSON key values: %j", (value) => {
    expect(
      Result.isFailure(
        Schema.decodeResult(
          Schema.toCodecJson(QueryStreamOrderKey.QueryStreamOrderKey),
        )([value]),
      ),
    ).toBe(true);
  });

  it("uses Convex ordering for individual values", () => {
    const values: QueryStreamOrderKey.QueryStreamOrderKey = [
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
        expect(QueryStreamOrderKey.ValueOrder(left, right)).toBe(
          Math.sign(compareValues(left, right)),
        );
      }
    }
  });

  it("compares keys lexicographically and reverses position order", () => {
    expect(QueryStreamOrderKey.Order(["a", 1], ["a", 2])).toBe(-1);
    expect(QueryStreamOrderKey.Order(["a"], ["a", 1])).toBe(-1);
    expect(QueryStreamOrderKey.Order(["b"], ["a", 2])).toBe(1);
    expect(QueryStreamOrderKey.Order([], [])).toBe(0);
    expect(QueryStreamOrderKey.PositionOrder("asc")(["a"], ["b"])).toBe(-1);
    expect(QueryStreamOrderKey.PositionOrder("desc")(["a"], ["b"])).toBe(1);
  });

  it("extracts nested values and retains missing fields", () => {
    expect(
      QueryStreamOrderKey.extract({ nested: { score: 2 }, _id: "n1" }, [
        ["nested", "score"],
        ["missing", "field"],
        ["_id"],
      ]),
    ).toEqual([2, undefined, "n1"]);
    expect(QueryStreamOrderKey.extract({}, [])).toEqual([]);
  });
});
