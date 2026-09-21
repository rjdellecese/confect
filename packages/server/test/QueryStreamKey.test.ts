import * as QueryStreamIndexPrefix from "@confect/server/QueryStreamIndexPrefix";
import * as Key from "@confect/server/QueryStreamKey";
import * as Layout from "@confect/server/QueryStreamKeyLayout";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Match from "effect/Match";
import * as Result from "effect/Result";

const layout = Result.getOrThrow(Layout.fromIndex(["score"]));

describe("QueryStreamKey", () => {
  it("distinguishes complete keys and stream prefixes", () => {
    expectTypeOf<Key.Complete>().toExtend<Key.QueryStreamKey>();
    expectTypeOf<Key.Prefix>().toExtend<Key.QueryStreamKey>();
    expectTypeOf<Key.Complete>().not.toExtend<Key.Prefix>();
    expectTypeOf<Key.Prefix>().not.toExtend<Key.Complete>();
    expectTypeOf<readonly [number, string]>().not.toExtend<Key.Complete>();
    const values = [3, "id"] as const;
    const key = Result.getOrThrow(Key.complete(layout, values));
    expect(Key.orderKey(key)).toBe(values);
    expect(Key.keyLayout(key)).toBe(layout);
    for (const prefix of [[], [3], values]) {
      const parsed = Result.getOrThrow(Key.prefix(layout, prefix));
      expect(Key.orderKey(parsed)).toBe(prefix);
      expect(Key.keyLayout(parsed)).toBe(layout);
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
            expect(complete.keyLayout).toBe(layout);
            return ["complete", complete.orderKey] as const;
          }),
          Match.tag("Prefix", (prefix) => {
            expectTypeOf<typeof prefix>().toEqualTypeOf<Key.Prefix>();
            expect(prefix.keyLayout).toBe(layout);
            return ["prefix", prefix.orderKey] as const;
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
    expect(Array.map(keys, Key.orderKey)).toEqual([[3, "id"], [3]]);
    expect(Array.map(keys, Key.keyLayout)).toEqual([layout, layout]);
  });

  it("recognizes the complete guarantee rather than the key width", () => {
    const complete = Result.getOrThrow(Key.complete(layout, [3, "id"]));
    const prefix = Result.getOrThrow(Key.prefix(layout, [3, "id"]));
    expect(Key.isComplete(complete)).toBe(true);
    expect(Key.isComplete(prefix)).toBe(false);
    expect(
      Key.isComplete({ _tag: "Complete", layout, values: [3, "id"] }),
    ).toBe(false);
    expect(
      Key.isComplete(
        Result.getOrThrow(QueryStreamIndexPrefix.make(["score"], [3])),
      ),
    ).toBe(false);
    expect(Key.isComplete(undefined)).toBe(false);
  });

  it("accepts complete zero-width keys", () => {
    const zero = Result.getOrThrow(Layout.fromIndex(["_id"], 1));
    expect(Key.orderKey(Result.getOrThrow(Key.complete(zero, [])))).toEqual([]);
    expect(Result.isFailure(Key.prefix(zero, [undefined]))).toBe(true);
  });
});
