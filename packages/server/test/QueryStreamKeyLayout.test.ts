import { identity } from "effect/Function";
import { QueryStreamKeyLayout as PublicKeyLayout } from "@confect/server";
import * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Result from "effect/Result";

describe("QueryStreamKeyLayout", () => {
  it("exports the layout constructors through the public namespace", () => {
    expect(PublicKeyLayout.fromIndex).toBe(QueryStreamKeyLayout.fromIndex);
    expect(PublicKeyLayout.concat).toBe(QueryStreamKeyLayout.concat);
  });

  it.each([
    {
      fieldPaths: [],
      count: 0,
      visible: [],
      width: 1,
      positions: [{ _tag: "ImplicitId" }],
    },
    {
      fieldPaths: ["text", "_creationTime"],
      count: 0,
      visible: ["text", "_creationTime"],
      width: 3,
      positions: [
        { _tag: "Visible", label: "text" },
        { _tag: "Visible", label: "_creationTime" },
        { _tag: "ImplicitId" },
      ],
    },
    {
      fieldPaths: ["text", "_creationTime"],
      count: 2,
      visible: [],
      width: 1,
      positions: [{ _tag: "ImplicitId" }],
    },
    {
      fieldPaths: ["_id"],
      count: 0,
      visible: ["_id"],
      width: 1,
      positions: [{ _tag: "Visible", label: "_id" }],
    },
    { fieldPaths: ["_id"], count: 1, visible: [], width: 0, positions: [] },
    {
      fieldPaths: ["_id", "text"],
      count: 0,
      visible: ["_id", "text"],
      width: 3,
      positions: [
        { _tag: "Visible", label: "_id" },
        { _tag: "Visible", label: "text" },
        { _tag: "ImplicitId" },
      ],
    },
  ])(
    "constructs the remaining scan key for $fieldPaths pinned by $count",
    ({ fieldPaths, count, visible, width, positions }) => {
      const layout = Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(fieldPaths, count),
        identity,
      );
      expect(QueryStreamKeyLayout.positions(layout)).toEqual(positions);
      expect(QueryStreamKeyLayout.visibleLabels(layout)).toEqual(visible);
      expect(QueryStreamKeyLayout.runtimeWidth(layout)).toBe(width);
    },
  );

  it.each([-1, 0.5, 2, NaN, Infinity])(
    "rejects an invalid equality prefix: %s",
    (count) => {
      const result = QueryStreamKeyLayout.fromIndex(["_id"], count);
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<
          QueryStreamKeyLayout.QueryStreamKeyLayout<
            QueryStreamKeyLabels.QueryStreamKeyLabels<ReadonlyArray<string>>
          >,
          QueryStreamKeyLayout.InvalidEqualityPrefixError
        >
      >();
      const error = Result.getOrThrow(Result.flip(result));
      expect(error).toBeInstanceOf(
        QueryStreamKeyLayout.InvalidEqualityPrefixError,
      );
      expect(error).toMatchObject({
        _tag: "InvalidEqualityPrefixError",
        fieldPaths: ["_id"],
        eqCount: count,
      });
    },
  );

  it("tracks visible label tuples through pinning, composition, and renaming", () => {
    const pinned = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["text", "_creationTime"], 1),
      identity,
    );
    expectTypeOf(pinned).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<
        QueryStreamKeyLabels.QueryStreamKeyLabels<["_creationTime"]>
      >
    >();
    expectTypeOf<
      QueryStreamKeyLayout.RemainingFieldPaths<["_id"], 0 | 1>
    >().toEqualTypeOf<["_id"] | []>();
    const zero = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"], 1),
      identity,
    );
    expectTypeOf(zero).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<
        QueryStreamKeyLabels.QueryStreamKeyLabels<[]>
      >
    >();
    const joined = QueryStreamKeyLayout.concat(
      pinned,
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["_id"]), identity),
    );
    expectTypeOf(joined).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<
        QueryStreamKeyLabels.QueryStreamKeyLabels<
          readonly ["_creationTime", "_id"]
        >
      >
    >();
    expectTypeOf(QueryStreamKeyLayout.visibleLabels(joined)).toEqualTypeOf<
      QueryStreamKeyLabels.QueryStreamKeyLabels<
        readonly ["_creationTime", "_id"]
      >
    >();
    expectTypeOf<ReadonlyArray<string>>().not.toExtend<
      Parameters<typeof QueryStreamKeyLayout.rename>[1]
    >();
    expectTypeOf<ReadonlyArray<string>>().not.toExtend<
      Parameters<typeof QueryStreamKeyLayout.resolvePrefix>[1]
    >();
    const renamed = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        joined,
        QueryStreamKeyLabels.make(["created", "id"]),
      ),
    );
    expectTypeOf(renamed).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<
        QueryStreamKeyLabels.QueryStreamKeyLabels<["created", "id"]>
      >
    >();
  });

  it("keeps a hidden ID before a renamed explicit component", () => {
    const explicit = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["_id"]),
          identity,
        ),
        QueryStreamKeyLabels.make(["hello"]),
      ),
    );
    const joined = QueryStreamKeyLayout.concat(
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
      explicit,
    );
    expect(QueryStreamKeyLayout.positions(joined)).toEqual([
      { _tag: "ImplicitId" },
      { _tag: "Visible", label: "hello" },
    ]);
    expect(
      Result.getOrThrow(
        QueryStreamKeyLayout.resolvePrefix(
          joined,
          QueryStreamKeyLabels.make(["hello"]),
        ),
      ),
    ).toBe(2);
  });

  it("resolves label prefixes including only intervening implicit IDs", () => {
    const layout = QueryStreamKeyLayout.concat(
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["text"]), identity),
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["created"]),
        identity,
      ),
    );
    expect(
      Result.getOrThrow(
        QueryStreamKeyLayout.resolvePrefix(
          layout,
          QueryStreamKeyLabels.make([]),
        ),
      ),
    ).toBe(0);
    expect(
      Result.getOrThrow(
        QueryStreamKeyLayout.resolvePrefix(
          layout,
          QueryStreamKeyLabels.make(["text"]),
        ),
      ),
    ).toBe(1);
    expect(
      Result.getOrThrow(
        QueryStreamKeyLayout.resolvePrefix(
          layout,
          QueryStreamKeyLabels.make(["text", "created"]),
        ),
      ),
    ).toBe(3);
    for (const invalid of [
      ["created"],
      ["text", "_id"],
      ["text", "created", "extra"],
    ]) {
      const prefixKeyLabels = QueryStreamKeyLabels.make(invalid);
      const result = QueryStreamKeyLayout.resolvePrefix(
        layout,
        prefixKeyLabels,
      );
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<number, QueryStreamKeyLayout.InvalidLabelPrefixError>
      >();
      const error = Result.getOrThrow(Result.flip(result));
      expect(error).toBeInstanceOf(
        QueryStreamKeyLayout.InvalidLabelPrefixError,
      );
      expect(error).toMatchObject({
        _tag: "InvalidLabelPrefixError",
        keyLabels: QueryStreamKeyLayout.visibleLabels(layout),
        prefixKeyLabels,
      });
    }
    const zero = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"], 1),
      identity,
    );
    expect(
      Result.getOrThrow(
        QueryStreamKeyLayout.resolvePrefix(zero, QueryStreamKeyLabels.make([])),
      ),
    ).toBe(0);
    expect(
      Result.isFailure(
        QueryStreamKeyLayout.resolvePrefix(
          zero,
          QueryStreamKeyLabels.make(["_id"]),
        ),
      ),
    ).toBe(true);
  });

  it("compares visible labels and implicit positions independently of composition", () => {
    const explicitFirst = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["text"]),
          identity,
        ),
        QueryStreamKeyLabels.make(["_id"]),
      ),
    );
    const implicitFirst = QueryStreamKeyLayout.concat(
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["_id"]), identity),
    );
    expect(QueryStreamKeyLayout.visibleLabels(explicitFirst)).toEqual(
      QueryStreamKeyLayout.visibleLabels(implicitFirst),
    );
    expect(QueryStreamKeyLayout.Equivalence(explicitFirst, implicitFirst)).toBe(
      false,
    );
    expect(QueryStreamKeyLayout.format(explicitFirst)).toBe(
      '["_id", <implicit _id>]',
    );
    expect(QueryStreamKeyLayout.format(implicitFirst)).toBe(
      '[<implicit _id>, "_id"]',
    );

    const explicit = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["_id"]),
          identity,
        ),
        QueryStreamKeyLabels.make(["text"]),
      ),
    );
    const composed = QueryStreamKeyLayout.concat(
      explicit,
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["created"]),
        identity,
      ),
    );
    const single = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["text", "created"]),
      identity,
    );
    expect(QueryStreamKeyLayout.Equivalence(composed, single)).toBe(true);
    expect(
      Result.isSuccess(
        QueryStreamKeyLayout.validateEquivalence(composed, single),
      ),
    ).toBe(true);
    expect(QueryStreamKeyLayout.Equivalence(single, composed)).toBe(true);
    expect(QueryStreamKeyLayout.Equivalence(single, explicit)).toBe(false);
    const mismatch = Result.getOrThrow(
      Result.flip(QueryStreamKeyLayout.validateEquivalence(single, explicit)),
    );
    expect(mismatch).toBeInstanceOf(
      QueryStreamKeyLayout.KeyLayoutMismatchError,
    );
    expect(mismatch.expectedKeyLayout).toBe(single);
    expect(mismatch.actualKeyLayout).toBe(explicit);
    expect(mismatch.message).toContain(QueryStreamKeyLayout.format(single));
    expect(mismatch.message).toContain(QueryStreamKeyLayout.format(explicit));
    expect(
      QueryStreamKeyLayout.Equivalence(
        single,
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["other", "created"]),
          identity,
        ),
      ),
    ).toBe(false);
  });

  it("distinguishes zero-width keys and consecutive implicit IDs", () => {
    const zero = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"], 1),
      identity,
    );
    const one = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex([]),
      identity,
    );
    const two = QueryStreamKeyLayout.concat(one, one);
    expect(QueryStreamKeyLayout.Equivalence(zero, one)).toBe(false);
    expect(QueryStreamKeyLayout.Equivalence(one, two)).toBe(false);
    expect(
      QueryStreamKeyLayout.Equivalence(
        two,
        QueryStreamKeyLayout.concat(one, one),
      ),
    ).toBe(true);
    const withLabel = QueryStreamKeyLayout.concat(
      two,
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["text"]), identity),
    );
    expect(
      Result.getOrThrow(
        QueryStreamKeyLayout.resolvePrefix(
          withLabel,
          QueryStreamKeyLabels.make(["text"]),
        ),
      ),
    ).toBe(3);
  });

  it("renames visible labels without losing implicit positions", () => {
    const layout = QueryStreamKeyLayout.concat(
      QueryStreamKeyLayout.concat(
        Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["_id"]),
          identity,
        ),
      ),
      QueryStreamKeyLayout.concat(
        Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["text", "_id"]),
          identity,
        ),
      ),
    );
    const renamed = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        layout,
        QueryStreamKeyLabels.make(["same", "same", ""]),
      ),
    );
    expect(QueryStreamKeyLayout.format(renamed)).toBe(
      '[<implicit _id>, "same", <implicit _id>, "same", ""]',
    );
    expect(QueryStreamKeyLayout.runtimeWidth(renamed)).toBe(5);
    for (const incomplete of [[], ["a"], ["a", "b"], ["a", "b", "c", "d"]]) {
      const replacementKeyLabels = QueryStreamKeyLabels.make(incomplete);
      const result = QueryStreamKeyLayout.rename(layout, replacementKeyLabels);
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<
          QueryStreamKeyLayout.QueryStreamKeyLayout<
            QueryStreamKeyLabels.QueryStreamKeyLabels<Array<string>>
          >,
          QueryStreamKeyLayout.LabelCountMismatchError
        >
      >();
      const error = Result.getOrThrow(Result.flip(result));
      expect(error).toBeInstanceOf(
        QueryStreamKeyLayout.LabelCountMismatchError,
      );
      expect(error).toMatchObject({
        _tag: "LabelCountMismatchError",
        keyLabels: QueryStreamKeyLayout.visibleLabels(layout),
        replacementKeyLabels,
      });
    }
  });

  it("preserves inputs through composition and renaming", () => {
    const fieldPaths = ["text"] as const;
    const outer = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(fieldPaths),
      identity,
    );
    const joined = QueryStreamKeyLayout.concat(
      outer,
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["created"]),
        identity,
      ),
    );
    const aliases = ["body", "time"] as const;
    const renamed = Result.getOrThrow(
      QueryStreamKeyLayout.rename(joined, QueryStreamKeyLabels.make(aliases)),
    );
    expect(QueryStreamKeyLayout.visibleLabels(renamed)).toEqual([
      "body",
      "time",
    ]);
    expect(QueryStreamKeyLayout.visibleLabels(joined)).toEqual([
      "text",
      "created",
    ]);
    expect(renamed).not.toBe(joined);
    expect(joined).not.toBe(outer);
    expect(QueryStreamKeyLayout.visibleLabels(outer)).toEqual(["text"]);
    expect(
      Result.isFailure(
        QueryStreamKeyLayout.rename(
          joined,
          QueryStreamKeyLabels.make(["body"]),
        ),
      ),
    ).toBe(true);
    const zero = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"], 1),
      identity,
    );
    expect(
      QueryStreamKeyLayout.visibleLabels(
        Result.getOrThrow(
          QueryStreamKeyLayout.rename(zero, QueryStreamKeyLabels.make([])),
        ),
      ),
    ).toEqual([]);
  });
});
