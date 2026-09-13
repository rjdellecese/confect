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
      const layout = QueryStreamKeyLayout.fromIndex(fieldPaths, count);
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
      expect(() => QueryStreamKeyLayout.fromIndex(["_id"], count)).toThrow(
        "invalid equality prefix length",
      );
    },
  );

  it("tracks logical tuples through pinning, composition, and renaming", () => {
    const pinned = QueryStreamKeyLayout.fromIndex(["text", "_creationTime"], 1);
    expectTypeOf(pinned).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<["_creationTime"]>
    >();
    expectTypeOf<
      QueryStreamKeyLayout.RemainingFieldPaths<["_id"], 0 | 1>
    >().toEqualTypeOf<["_id"] | []>();
    const zero = QueryStreamKeyLayout.fromIndex(["_id"], 1);
    expectTypeOf(zero).toEqualTypeOf<
      QueryStreamKeyLayout.QueryStreamKeyLayout<[]>
    >();
    const joined = QueryStreamKeyLayout.concat(
      pinned,
      QueryStreamKeyLayout.fromIndex(["_id"]),
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
        QueryStreamKeyLayout.fromIndex(["_id"]),
        QueryStreamKeyLabels.make(["hello"]),
      ),
    );
    const joined = QueryStreamKeyLayout.concat(
      QueryStreamKeyLayout.fromIndex([]),
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
      QueryStreamKeyLayout.fromIndex(["text"]),
      QueryStreamKeyLayout.fromIndex(["created"]),
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
      expect(
        Result.isFailure(
          QueryStreamKeyLayout.resolvePrefix(
            layout,
            QueryStreamKeyLabels.make(invalid),
          ),
        ),
      ).toBe(true);
    }
    const zero = QueryStreamKeyLayout.fromIndex(["_id"], 1);
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
        QueryStreamKeyLayout.fromIndex(["text"]),
        QueryStreamKeyLabels.make(["_id"]),
      ),
    );
    const implicitFirst = QueryStreamKeyLayout.concat(
      QueryStreamKeyLayout.fromIndex([]),
      QueryStreamKeyLayout.fromIndex(["_id"]),
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
        QueryStreamKeyLayout.fromIndex(["_id"]),
        QueryStreamKeyLabels.make(["text"]),
      ),
    );
    const composed = QueryStreamKeyLayout.concat(
      explicit,
      QueryStreamKeyLayout.fromIndex(["created"]),
    );
    const single = QueryStreamKeyLayout.fromIndex(["text", "created"]);
    expect(QueryStreamKeyLayout.compatible(composed, single)).toBe(true);
    expect(QueryStreamKeyLayout.compatible(single, composed)).toBe(true);
    expect(QueryStreamKeyLayout.compatible(single, explicit)).toBe(false);
    expect(
      QueryStreamKeyLayout.compatible(
        single,
        QueryStreamKeyLayout.fromIndex(["other", "created"]),
      ),
    ).toBe(false);
  });

  it("distinguishes zero-width keys and consecutive implicit IDs", () => {
    const zero = QueryStreamKeyLayout.fromIndex(["_id"], 1);
    const one = QueryStreamKeyLayout.fromIndex([]);
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
      QueryStreamKeyLayout.fromIndex(["text"]),
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
        QueryStreamKeyLayout.fromIndex([]),
        QueryStreamKeyLayout.fromIndex(["_id"]),
      ),
      QueryStreamKeyLayout.concat(
        QueryStreamKeyLayout.fromIndex([]),
        QueryStreamKeyLayout.fromIndex(["text", "_id"]),
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
      expect(
        Result.isFailure(
          QueryStreamKeyLayout.rename(
            layout,
            QueryStreamKeyLabels.make(incomplete),
          ),
        ),
      ).toBe(true);
    }
  });

  it("preserves inputs through composition and renaming", () => {
    const fieldPaths = ["text"] as const;
    const outer = QueryStreamKeyLayout.fromIndex(fieldPaths);
    const joined = QueryStreamKeyLayout.concat(
      outer,
      QueryStreamKeyLayout.fromIndex(["created"]),
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
    const zero = QueryStreamKeyLayout.fromIndex(["_id"], 1);
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
