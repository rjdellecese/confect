import * as QueryStream from "@confect/server/QueryStream";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import * as IndexRange from "@confect/server/QueryStreamIndexRange";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Result from "effect/Result";

const layout = Result.getOrThrow(Layout.fromIndex(["score"]));

describe("QueryStreamKey", () => {
  it("distinguishes complete keys, stream prefixes, and index prefixes", () => {
    expectTypeOf<Key.Complete>().not.toExtend<Key.Prefix>();
    expectTypeOf<Key.Prefix>().not.toExtend<Key.Complete>();
    expectTypeOf<Key.Prefix>().not.toExtend<Key.IndexPrefix>();
    expectTypeOf<readonly [number, string]>().not.toExtend<Key.Complete>();
    const values = Object.freeze([3, "id"]);
    const key = Result.getOrThrow(Key.complete(layout, values));
    expect(Key.values(key)).toBe(values);
    expect(Key.prefixValues(Key.asPrefix(key))).toBe(values);
    expect(Key.layout(key)).toBe(layout);
    for (const prefix of [[], [3], values]) {
      expect(Result.isSuccess(Key.prefix(layout, prefix))).toBe(true);
    }
    for (const invalid of [[], [3], [3, "id", 4]]) {
      expect(Result.isFailure(Key.complete(layout, invalid))).toBe(true);
    }
    expect(Result.isFailure(Key.prefix(layout, [3, "id", 4]))).toBe(true);
  });

  it("accepts complete zero-width keys", () => {
    const zero = Result.getOrThrow(Layout.fromIndex(["_id"], 1));
    expect(Key.values(Result.getOrThrow(Key.complete(zero, [])))).toEqual([]);
    expect(Result.isFailure(Key.prefix(zero, [undefined]))).toBe(true);
  });

  it("restores pinned values only when entering index coordinates", () => {
    const prefix = Result.getOrThrow(Key.prefix(layout, [3]));
    const index = Result.getOrThrow(
      Key.toIndexPrefix(["category", "score", "_id"], ["a"], prefix),
    );
    expect(Key.indexEntries(index)).toEqual([
      ["category", "a"],
      ["score", 3],
    ]);
    expect(
      Result.isFailure(Key.toIndexPrefix(["category"], ["a"], prefix)),
    ).toBe(true);
  });

  it("rejects oversized bounds before constructing a scan", () => {
    const stream = QueryStream.empty<never>()(layout);
    expect(() =>
      QueryStream.narrow(stream, {
        start: { orderKey: [3, "id", 4], inclusive: true },
      }),
    ).toThrow(Key.KeyWidthMismatchError);
    const split = IndexRange.fromBounds(["score"], "asc", {
      lower: { orderKey: [3, "id"], inclusive: true },
      upper: { orderKey: [], inclusive: true },
    });
    expect(Result.isFailure(split)).toBe(true);
    if (Result.isFailure(split)) {
      expect(split.failure).toMatchObject({
        _tag: "KeyWidthMismatchError",
        kind: "index prefix",
        width: 1,
        actual: 2,
      });
    }
  });
});
