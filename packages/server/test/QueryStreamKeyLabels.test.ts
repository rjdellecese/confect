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
    expectTypeOf(labels).toExtend<readonly ["author", "created"]>();
    expectTypeOf<
      ReadonlyArray<string>
    >().not.toExtend<QueryStreamKeyLabels.QueryStreamKeyLabels>();
    expectTypeOf(labels).toExtend<ReadonlyArray<string>>();
    expectTypeOf(labels).not.toExtend<string[]>();
    expectTypeOf(labels[0]).toEqualTypeOf<"author">();
    expectTypeOf(labels.length).toEqualTypeOf<2>();
    expectTypeOf(
      labels.map((name) => name),
    ).not.toExtend<QueryStreamKeyLabels.QueryStreamKeyLabels>();
  });

  it("retains empty and repeated names", () => {
    const input = ["", "created", "created"] as const;
    const labels = QueryStreamKeyLabels.make(input);
    expect(labels).toBe(input);
    expect(labels).toEqual(["", "created", "created"]);
    expect(labels.length).toBe(3);
    expect(QueryStreamKeyLabels.make([]).length).toBe(0);
  });

  it("brands mutable inputs as readonly without copying or changing them", () => {
    const input: ["author", "created"] = ["author", "created"];
    const labels = QueryStreamKeyLabels.make(input);
    expect(labels).toBe(input);
    expect(input).toEqual(["author", "created"]);
    expectTypeOf(labels).toExtend<readonly ["author", "created"]>();
    expectTypeOf(labels).not.toExtend<string[]>();
  });

  it("preserves tuple positions when concatenating branded label types", () => {
    type Labels<Names extends ReadonlyArray<string>> =
      QueryStreamKeyLabels.QueryStreamKeyLabels<Names>;
    expectTypeOf<
      QueryStreamKeyLabels.Concat<Labels<["a", "a"]>, Labels<["b"]>>
    >().toEqualTypeOf<Labels<readonly ["a", "a", "b"]>>();
    expectTypeOf<
      QueryStreamKeyLabels.Concat<Labels<[]>, Labels<["b"]>>
    >().toEqualTypeOf<Labels<readonly ["b"]>>();
    expectTypeOf<
      QueryStreamKeyLabels.Concat<Labels<["a"] | ["b"]>, Labels<["c"]>>
    >().toEqualTypeOf<Labels<readonly ["a", "c"] | readonly ["b", "c"]>>();
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
