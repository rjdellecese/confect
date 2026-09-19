import { QueryStreamKeyLabels as PublicKeyLabels } from "@confect/server";
import * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";

describe("QueryStreamKeyLabels", () => {
  it("exports labels through the public namespace", () => {
    expect(PublicKeyLabels.make).toBe(QueryStreamKeyLabels.make);
  });

  it("retains literal tuples while distinguishing labels from source paths", () => {
    const labels = QueryStreamKeyLabels.make(["author", "created"]);
    expectTypeOf(labels).toEqualTypeOf<
      QueryStreamKeyLabels.QueryStreamKeyLabels<readonly ["author", "created"]>
    >();
    expectTypeOf(QueryStreamKeyLabels.toArray(labels)).toEqualTypeOf<
      readonly ["author", "created"]
    >();
    expectTypeOf<
      ReadonlyArray<string>
    >().not.toExtend<QueryStreamKeyLabels.QueryStreamKeyLabels>();
    expectTypeOf(labels).not.toExtend<ReadonlyArray<string>>();
    expectTypeOf(QueryStreamKeyLabels.toArray(labels)).not.toExtend<string[]>();
  });

  it("retains empty and repeated names", () => {
    const input = ["", "created", "created"] as const;
    const labels = QueryStreamKeyLabels.make(input);
    expect(QueryStreamKeyLabels.toArray(labels)).toEqual([
      "",
      "created",
      "created",
    ]);
    expect(QueryStreamKeyLabels.size(labels)).toBe(3);
    expect(QueryStreamKeyLabels.size(QueryStreamKeyLabels.make([]))).toBe(0);
  });

  it.each([[], ["a"], ["a", "a"], ["a", "a", "b"]])(
    "accepts matching prefixes: %j",
    (...prefix) => {
      expect(
        QueryStreamKeyLabels.hasPrefix(
          QueryStreamKeyLabels.make(["a", "a", "b"]),
          QueryStreamKeyLabels.make(prefix),
        ),
      ).toBe(true);
    },
  );

  it.each([["b"], ["a", "b"], ["a", "a", "b", "c"]])(
    "rejects skipped, reordered, or overlong prefixes: %j",
    (...prefix) => {
      expect(
        QueryStreamKeyLabels.hasPrefix(
          QueryStreamKeyLabels.make(["a", "a", "b"]),
          QueryStreamKeyLabels.make(prefix),
        ),
      ).toBe(false);
    },
  );
});
