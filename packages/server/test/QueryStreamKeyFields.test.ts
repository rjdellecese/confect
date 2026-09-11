import { QueryStreamKeyFields as PublicKeyFields } from "@confect/server";
import * as QueryStreamKeyFields from "@confect/server/QueryStreamKeyFields";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

describe("QueryStreamKeyFields", () => {
  it("exports a schema and type for ordered field names", () => {
    expect(PublicKeyFields.QueryStreamKeyFields).toBe(
      QueryStreamKeyFields.QueryStreamKeyFields,
    );
    expect(PublicKeyFields.Equivalence).toBe(QueryStreamKeyFields.Equivalence);
    const fields = Schema.decodeSync(QueryStreamKeyFields.QueryStreamKeyFields)(
      ["text", "_creationTime", "_id"],
    );
    expectTypeOf(
      fields,
    ).toEqualTypeOf<QueryStreamKeyFields.QueryStreamKeyFields>();
    expectTypeOf(fields).toEqualTypeOf<ReadonlyArray<string>>();
    expect(fields).toEqual(["text", "_creationTime", "_id"]);
    expect(Schema.is(QueryStreamKeyFields.QueryStreamKeyFields)([])).toBe(true);
    expect(Schema.is(QueryStreamKeyFields.QueryStreamKeyFields)([1])).toBe(
      false,
    );
  });

  it.each([
    { left: [], right: [], equal: true },
    { left: ["text", "_id"], right: ["text", "_id"], equal: true },
    { left: ["text", "_id"], right: ["body", "_id"], equal: false },
    { left: ["text", "_id"], right: ["_id", "text"], equal: false },
    { left: ["text", "_id"], right: ["text"], equal: false },
  ])(
    "compares exact field names and order: $left / $right",
    ({ left, right, equal }) => {
      expect(QueryStreamKeyFields.Equivalence(left, right)).toBe(equal);
    },
  );

  it("preserves field tuple inference", () => {
    expectTypeOf<
      QueryStreamKeyFields.Head<readonly ["text", "_id"]>
    >().toEqualTypeOf<"text">();
    expectTypeOf<
      QueryStreamKeyFields.Tail<readonly ["text", "_id"]>
    >().toEqualTypeOf<["_id"]>();
    expectTypeOf<QueryStreamKeyFields.Head<[]>>().toEqualTypeOf<never>();
    expectTypeOf<QueryStreamKeyFields.Tail<["_id"]>>().toEqualTypeOf<[]>();
    expectTypeOf<
      QueryStreamKeyFields.Head<ReadonlyArray<string>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      QueryStreamKeyFields.Tail<ReadonlyArray<string>>
    >().toEqualTypeOf<ReadonlyArray<string>>();
  });

  it.each([
    { fields: [], expected: ["_id"], tiebreakers: [0] },
    {
      fields: ["text", "_creationTime"],
      expected: ["text", "_creationTime", "_id"],
      tiebreakers: [2],
    },
    { fields: ["_id"], expected: ["_id"], tiebreakers: [] },
    {
      fields: ["_id", "text"],
      expected: ["_id", "text", "_id"],
      tiebreakers: [2],
    },
  ])(
    "tracks only an appended ID for $fields",
    ({ fields, expected, tiebreakers }) => {
      const original = Object.freeze(fields);
      const actual = QueryStreamKeyFields.withIdTiebreaker(original);
      expect(actual).toEqual(expected);
      expect(QueryStreamKeyFields.appendedTiebreaker(original, actual)).toEqual(
        tiebreakers,
      );
      if (tiebreakers.length === 0) {
        expect(actual).toBe(original);
      }
    },
  );

  it("excludes implicit IDs while retaining explicit ID fields", () => {
    expect(
      QueryStreamKeyFields.visibleKeyFields({
        keyFields: ["text", "_id", "_creationTime", "_id"],
        tiebreakers: [1, 3],
      }),
    ).toEqual(["text", "_creationTime"]);
    expect(
      QueryStreamKeyFields.visibleKeyFields({
        keyFields: ["_id"],
        tiebreakers: [],
      }),
    ).toEqual(["_id"]);
    expect(
      QueryStreamKeyFields.visibleKeyFields({
        keyFields: [],
        tiebreakers: [],
      }),
    ).toEqual([]);
  });

  it("includes interior tiebreakers in a runtime prefix", () => {
    const layout = {
      keyFields: ["text", "_id", "_creationTime", "_id"],
      tiebreakers: [1, 3],
    };
    expect(QueryStreamKeyFields.runtimePrefixLength(layout, 0)).toBe(0);
    expect(QueryStreamKeyFields.runtimePrefixLength(layout, 1)).toBe(1);
    expect(QueryStreamKeyFields.runtimePrefixLength(layout, 2)).toBe(3);
    expect(() => QueryStreamKeyFields.runtimePrefixLength(layout, 3)).toThrow(
      "prefix length 3 exceeds the order key",
    );
    expect(
      QueryStreamKeyFields.runtimePrefixLength(
        { keyFields: [], tiebreakers: [] },
        0,
      ),
    ).toBe(0);
  });

  it("renames only visible fields without mutating the layout", () => {
    const layout = Object.freeze({
      keyFields: Object.freeze(["text", "_id", "_creationTime", "_id"]),
      tiebreakers: Object.freeze([1, 3]),
    });
    expect(QueryStreamKeyFields.rename(layout, ["body", "created"])).toEqual([
      "body",
      "_id",
      "created",
      "_id",
    ]);
    expect(layout.keyFields).toEqual(["text", "_id", "_creationTime", "_id"]);
    expect(() => QueryStreamKeyFields.rename(layout, ["body"])).toThrow(
      "must have as many fields",
    );
    expect(
      QueryStreamKeyFields.rename({ keyFields: ["_id"], tiebreakers: [] }, [
        "id",
      ]),
    ).toEqual(["id"]);
    expect(
      QueryStreamKeyFields.rename({ keyFields: [], tiebreakers: [] }, []),
    ).toEqual([]);
  });
});
