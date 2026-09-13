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
      segments: [
        { _tag: "WithImplicitId", labels: QueryStreamKeyLabels.make([]) },
      ],
    },
    {
      fieldPaths: ["text", "_creationTime"],
      count: 0,
      visible: ["text", "_creationTime"],
      width: 3,
      segments: [
        {
          _tag: "WithImplicitId",
          labels: QueryStreamKeyLabels.make(["text", "_creationTime"]),
        },
      ],
    },
    {
      fieldPaths: ["text", "_creationTime"],
      count: 2,
      visible: [],
      width: 1,
      segments: [
        { _tag: "WithImplicitId", labels: QueryStreamKeyLabels.make([]) },
      ],
    },
    {
      fieldPaths: ["_id"],
      count: 0,
      visible: ["_id"],
      width: 1,
      segments: [
        { _tag: "Explicit", labels: QueryStreamKeyLabels.make(["_id"]) },
      ],
    },
    { fieldPaths: ["_id"], count: 1, visible: [], width: 0, segments: [] },
    {
      fieldPaths: ["_id", "text"],
      count: 0,
      visible: ["_id", "text"],
      width: 3,
      segments: [
        {
          _tag: "WithImplicitId",
          labels: QueryStreamKeyLabels.make(["_id", "text"]),
        },
      ],
    },
  ])(
    "constructs the remaining scan key for $fieldPaths pinned by $count",
    ({ fieldPaths, count, visible, width, segments }) => {
      const layout = Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(fieldPaths, count),
        identity,
      );
      expect(QueryStreamKeyLayout.segments(layout)).toEqual(segments);
      expect(
        QueryStreamKeyLabels.toArray(
          QueryStreamKeyLayout.visibleLabels(layout),
        ),
      ).toEqual(visible);
      expect(QueryStreamKeyLayout.runtimeWidth(layout)).toBe(width);
    },
  );

  it.each([-1, 0.5, 2, NaN, Infinity])(
    "rejects an invalid equality prefix: %s",
    (count) => {
      const result = QueryStreamKeyLayout.fromIndex(["_id"], count);
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<
          QueryStreamKeyLayout.QueryStreamKeyLayout<ReadonlyArray<string>>,
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

  it("tracks logical tuples through pinning, composition, and renaming", () => {
    const pinned = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["text", "_creationTime"], 1),
      identity,
    );
    expectTypeOf(pinned).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<["_creationTime"]>
    >();
    expectTypeOf<
      QueryStreamKeyLayout.RemainingFieldPaths<["_id"], 0 | 1>
    >().toEqualTypeOf<["_id"] | []>();
    const zero = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"], 1),
      identity,
    );
    expectTypeOf(zero).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<[]>
    >();
    const joined = QueryStreamKeyLayout.concat(
      pinned,
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["_id"]), identity),
    );
    expectTypeOf(joined).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<
        readonly ["_creationTime", "_id"]
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
      QueryStreamKeyLayout.QueryStreamKeyLayout<["created", "id"]>
    >();
    expectTypeOf<{
      readonly _tag: "Explicit";
      readonly labels: QueryStreamKeyLabels.QueryStreamKeyLabels<[]>;
    }>().not.toExtend<QueryStreamKeyLayout.Segment>();
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
    expect(QueryStreamKeyLayout.segments(joined)).toEqual([
      { _tag: "WithImplicitId", labels: QueryStreamKeyLabels.make([]) },
      { _tag: "Explicit", labels: QueryStreamKeyLabels.make(["hello"]) },
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

  it("resolves logical prefixes including only intervening hidden IDs", () => {
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
      const prefixLabels = QueryStreamKeyLabels.make(invalid);
      const result = QueryStreamKeyLayout.resolvePrefix(layout, prefixLabels);
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<number, QueryStreamKeyLayout.InvalidLabelPrefixError>
      >();
      const error = Result.getOrThrow(Result.flip(result));
      expect(error).toBeInstanceOf(
        QueryStreamKeyLayout.InvalidLabelPrefixError,
      );
      expect(error).toMatchObject({
        _tag: "InvalidLabelPrefixError",
        labels: QueryStreamKeyLayout.visibleLabels(layout),
        prefixLabels,
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

  it("compares visible labels and implicit positions without requiring identical segments", () => {
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
    expect(
      QueryStreamKeyLabels.toArray(
        QueryStreamKeyLayout.visibleLabels(explicitFirst),
      ),
    ).toEqual(
      QueryStreamKeyLabels.toArray(
        QueryStreamKeyLayout.visibleLabels(implicitFirst),
      ),
    );
    expect(QueryStreamKeyLayout.compatible(explicitFirst, implicitFirst)).toBe(
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
    expect(QueryStreamKeyLayout.compatible(composed, single)).toBe(true);
    expect(QueryStreamKeyLayout.compatible(single, composed)).toBe(true);
    expect(QueryStreamKeyLayout.compatible(single, explicit)).toBe(false);
    expect(
      QueryStreamKeyLayout.compatible(
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
    expect(QueryStreamKeyLayout.compatible(zero, one)).toBe(false);
    expect(QueryStreamKeyLayout.compatible(one, two)).toBe(false);
    expect(
      QueryStreamKeyLayout.compatible(
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

  it("parses replacements across explicit and implicit-only segments without losing positions", () => {
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
      const replacementLabels = QueryStreamKeyLabels.make(incomplete);
      const result = QueryStreamKeyLayout.rename(layout, replacementLabels);
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<
          QueryStreamKeyLayout.QueryStreamKeyLayout<Array<string>>,
          QueryStreamKeyLayout.LabelCountMismatchError
        >
      >();
      const error = Result.getOrThrow(Result.flip(result));
      expect(error).toBeInstanceOf(
        QueryStreamKeyLayout.LabelCountMismatchError,
      );
      expect(error).toMatchObject({
        _tag: "LabelCountMismatchError",
        labels: QueryStreamKeyLayout.visibleLabels(layout),
        replacementLabels,
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
    expect(
      QueryStreamKeyLabels.toArray(QueryStreamKeyLayout.visibleLabels(renamed)),
    ).toEqual(["body", "time"]);
    expect(
      QueryStreamKeyLabels.toArray(QueryStreamKeyLayout.visibleLabels(joined)),
    ).toEqual(["text", "created"]);
    expect(renamed).not.toBe(joined);
    expect(joined).not.toBe(outer);
    expect(
      QueryStreamKeyLabels.toArray(QueryStreamKeyLayout.visibleLabels(outer)),
    ).toEqual(["text"]);
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
      QueryStreamKeyLabels.toArray(
        QueryStreamKeyLayout.visibleLabels(
          Result.getOrThrow(
            QueryStreamKeyLayout.rename(zero, QueryStreamKeyLabels.make([])),
          ),
        ),
      ),
    ).toEqual([]);
  });
});
