import * as QueryStreamIndexPrefix from "@confect/server/QueryStreamIndexPrefix";
import * as QueryStreamKey from "@confect/server/QueryStreamKey";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Result from "effect/Result";

const fieldPaths = ["category", "score", "_id"] as const;
const layout = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["score"]));

describe("QueryStreamIndexPrefix", () => {
  it("distinguishes index coordinates from stream keys", () => {
    expectTypeOf<QueryStreamIndexPrefix.QueryStreamIndexPrefix>().not.toExtend<QueryStreamKey.QueryStreamKey>();
    expectTypeOf<QueryStreamKey.Prefix>().not.toExtend<QueryStreamIndexPrefix.QueryStreamIndexPrefix>();
    expectTypeOf<QueryStreamKey.Complete>().not.toExtend<QueryStreamIndexPrefix.QueryStreamIndexPrefix>();
  });

  it("pairs values with the supplied field paths in order", () => {
    for (const [keyValues, indexEntries] of [
      [[], []],
      [["a"], [["category", "a"]]],
      [
        ["a", undefined],
        [
          ["category", "a"],
          ["score", undefined],
        ],
      ],
      [
        ["a", 3, "id"],
        [
          ["category", "a"],
          ["score", 3],
          ["_id", "id"],
        ],
      ],
    ] as const) {
      const prefix = Result.getOrThrow(
        QueryStreamIndexPrefix.make(fieldPaths, keyValues),
      );
      expect(QueryStreamIndexPrefix.entries(prefix)).toEqual(indexEntries);
      expect(QueryStreamIndexPrefix.values(prefix)).toEqual(keyValues);
    }
    expect(
      QueryStreamIndexPrefix.entries(
        Result.getOrThrow(QueryStreamIndexPrefix.make([], [])),
      ),
    ).toEqual([]);
  });

  it("rejects excess values instead of dropping them", () => {
    expect(QueryStreamIndexPrefix.make(["score"], [3, "id"])).toEqual(
      Result.fail(
        new QueryStreamIndexPrefix.IndexPrefixWidthMismatchError({
          width: 1,
          actual: 2,
        }),
      ),
    );
    expect(QueryStreamIndexPrefix.make([], [undefined])).toEqual(
      Result.fail(
        new QueryStreamIndexPrefix.IndexPrefixWidthMismatchError({
          width: 0,
          actual: 1,
        }),
      ),
    );
  });

  it("restores pinned values for either stream-key variant", () => {
    const keys: ReadonlyArray<QueryStreamKey.QueryStreamKey> = [
      Result.getOrThrow(QueryStreamKey.complete(layout, [3, "id"])),
      Result.getOrThrow(QueryStreamKey.prefix(layout, [3])),
    ];
    const prefixes = Array.map(keys, (key) =>
      Result.getOrThrow(
        QueryStreamIndexPrefix.fromStreamKey(fieldPaths, ["a"], key),
      ),
    );
    expect(Array.map(prefixes, QueryStreamIndexPrefix.entries)).toEqual([
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
    expect(Array.map(prefixes, QueryStreamIndexPrefix.values)).toEqual([
      ["a", 3, "id"],
      ["a", 3],
    ]);
  });

  it("checks the combined width after restoring equality values", () => {
    const prefix = Result.getOrThrow(QueryStreamKey.prefix(layout, [3]));
    expect(
      QueryStreamIndexPrefix.fromStreamKey(["category"], ["a"], prefix),
    ).toEqual(
      Result.fail(
        new QueryStreamIndexPrefix.IndexPrefixWidthMismatchError({
          width: 1,
          actual: 2,
        }),
      ),
    );
  });
});
