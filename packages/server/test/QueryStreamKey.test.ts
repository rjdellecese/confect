import * as QueryStream from "@confect/server/QueryStream";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import * as IndexRange from "@confect/server/QueryStreamIndexRange";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Match from "effect/Match";
import * as Result from "effect/Result";

const layout = Result.getOrThrow(Layout.fromIndex(["score"]));

describe("QueryStreamKey", () => {
  it("distinguishes complete keys, stream prefixes, and index prefixes", () => {
    expectTypeOf<Key.Complete>().toExtend<Key.QueryStreamKey>();
    expectTypeOf<Key.Prefix>().toExtend<Key.QueryStreamKey>();
    expectTypeOf<Key.IndexPrefix>().not.toExtend<Key.QueryStreamKey>();
    expectTypeOf<Key.Complete>().not.toExtend<Key.Prefix>();
    expectTypeOf<Key.Prefix>().not.toExtend<Key.Complete>();
    expectTypeOf<Key.Prefix>().not.toExtend<Key.IndexPrefix>();
    expectTypeOf<readonly [number, string]>().not.toExtend<Key.Complete>();
    const values = [3, "id"] as const;
    const key = Result.getOrThrow(Key.complete(layout, values));
    expect(Key.values(key)).toBe(values);
    expect(Key.layout(key)).toBe(layout);
    for (const prefix of [[], [3], values]) {
      const parsed = Result.getOrThrow(Key.prefix(layout, prefix));
      expect(Key.values(parsed)).toBe(prefix);
      expect(Key.layout(parsed)).toBe(layout);
    }
    for (const invalid of [[], [3], [3, "id", 4]]) {
      expect(Result.isFailure(Key.complete(layout, invalid))).toBe(true);
    }
    expect(Result.isFailure(Key.prefix(layout, [3, "id", 4]))).toBe(true);
  });

  it("exposes the parsing guarantee for exhaustive matching", () => {
    const keys: ReadonlyArray<Key.QueryStreamKey> = [
      Result.getOrThrow(Key.complete(layout, [3, "id"])),
      Result.getOrThrow(Key.prefix(layout, [3, "id"])),
    ];
    expect(
      Array.map(keys, (key) =>
        Match.value(key).pipe(
          Match.tag("Complete", (complete) => {
            expectTypeOf<typeof complete>().toEqualTypeOf<Key.Complete>();
            expect(complete.layout).toBe(layout);
            return ["complete", complete.values] as const;
          }),
          Match.tag("Prefix", (prefix) => {
            expectTypeOf<typeof prefix>().toEqualTypeOf<Key.Prefix>();
            expect(prefix.layout).toBe(layout);
            return ["prefix", prefix.values] as const;
          }),
          Match.exhaustive,
        ),
      ),
    ).toEqual([
      ["complete", [3, "id"]],
      ["prefix", [3, "id"]],
    ]);
  });

  it("reads either parsing guarantee through the shared key type", () => {
    const keys: ReadonlyArray<Key.QueryStreamKey> = [
      Result.getOrThrow(Key.complete(layout, [3, "id"])),
      Result.getOrThrow(Key.prefix(layout, [3])),
    ];
    expect(Array.map(keys, Key.values)).toEqual([[3, "id"], [3]]);
    expect(Array.map(keys, Key.layout)).toEqual([layout, layout]);
    expect(
      Array.map(keys, (key) =>
        Key.indexEntries(
          Result.getOrThrow(
            Key.toIndexPrefix(["category", "score", "_id"], ["a"], key),
          ),
        ),
      ),
    ).toEqual([
      [
        ["category", "a"],
        ["score", 3],
        ["_id", "id"],
      ],
      [
        ["category", "a"],
        ["score", 3],
      ],
    ]);
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
