import { QueryStreamKeyLabels as PublicKeyLabels } from "@confect/server";
import * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";

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

  it.each([
    { prefix: [], rest: ["a", "a", "b"] },
    { prefix: ["a"], rest: ["a", "b"] },
    { prefix: ["a", "a"], rest: ["b"] },
    { prefix: ["a", "a", "b"], rest: [] },
  ])("parses prefix $prefix into the remaining labels", ({ prefix, rest }) => {
    const labels = QueryStreamKeyLabels.make(["a", "a", "b"]);
    const selected = QueryStreamKeyLabels.make(prefix);
    const remaining = Option.getOrThrow(
      QueryStreamKeyLabels.stripPrefix(labels, selected),
    );
    expect(QueryStreamKeyLabels.toArray(remaining)).toEqual(rest);
    expect([
      ...QueryStreamKeyLabels.toArray(selected),
      ...QueryStreamKeyLabels.toArray(remaining),
    ]).toEqual(QueryStreamKeyLabels.toArray(labels));
  });

  it.each([["b"], ["a", "b"], ["a", "a", "b", "c"]])(
    "rejects skipped, reordered, or overlong prefixes: %j",
    (...prefix) => {
      expect(
        Option.isNone(
          QueryStreamKeyLabels.stripPrefix(
            QueryStreamKeyLabels.make(["a", "a", "b"]),
            QueryStreamKeyLabels.make(prefix),
          ),
        ),
      ).toBe(true);
    },
  );
});
