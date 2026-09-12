import { QueryStreamKeyFields as PublicKeyFields } from "@confect/server";
import * as QueryStreamKeyFields from "@confect/server/QueryStreamKeyFields";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("QueryStreamKeyFields", () => {
  it("exports a schema and type for ordered field names", () => {
    expect(PublicKeyFields.QueryStreamKeyFields).toBe(
      QueryStreamKeyFields.QueryStreamKeyFields,
    );
    expect(PublicKeyFields.Names).toBe(QueryStreamKeyFields.Names);
    expect(PublicKeyFields.Equivalence).toBe(QueryStreamKeyFields.Equivalence);
    const fields = Schema.decodeSync(QueryStreamKeyFields.Names)([
      "text",
      "_creationTime",
      "_id",
    ]);
    expectTypeOf(fields).toEqualTypeOf<QueryStreamKeyFields.Names>();
    expectTypeOf(fields).toEqualTypeOf<ReadonlyArray<string>>();
    expect(fields).toEqual(["text", "_creationTime", "_id"]);
    expect(Schema.is(QueryStreamKeyFields.Names)([])).toBe(true);
    expect(Schema.is(QueryStreamKeyFields.Names)([1])).toBe(false);
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
      const actual = QueryStreamKeyFields.fromIndex(original);
      expect(QueryStreamKeyFields.names(actual)).toEqual(expected);
      expect(
        actual.fields.flatMap((field, index) =>
          field._tag === "ImplicitId" ? [index] : [],
        ),
      ).toEqual(tiebreakers);
      expect(QueryStreamKeyFields.visibleKeyFields(actual)).toEqual(original);
    },
  );

  it("excludes implicit IDs while retaining explicit ID fields", () => {
    const joined = QueryStreamKeyFields.concat(
      QueryStreamKeyFields.fromIndex(["text"]),
      QueryStreamKeyFields.fromIndex(["_creationTime"]),
    );
    expect(QueryStreamKeyFields.names(joined)).toEqual([
      "text",
      "_id",
      "_creationTime",
      "_id",
    ]);
    expect(QueryStreamKeyFields.visibleKeyFields(joined)).toEqual([
      "text",
      "_creationTime",
    ]);
    expect(
      QueryStreamKeyFields.visibleKeyFields(
        QueryStreamKeyFields.fromIndex(["_id"]),
      ),
    ).toEqual(["_id"]);
    expect(
      QueryStreamKeyFields.visibleKeyFields(
        new QueryStreamKeyFields.QueryStreamKeyFields({ fields: [] }),
      ),
    ).toEqual([]);
  });

  it("includes interior tiebreakers in a runtime prefix", () => {
    const layout = QueryStreamKeyFields.concat(
      QueryStreamKeyFields.fromIndex(["text"]),
      QueryStreamKeyFields.fromIndex(["_creationTime"]),
    );
    expect(
      Result.getOrThrow(QueryStreamKeyFields.runtimePrefixLength(layout, 0)),
    ).toBe(0);
    expect(
      Result.getOrThrow(QueryStreamKeyFields.runtimePrefixLength(layout, 1)),
    ).toBe(1);
    expect(
      Result.getOrThrow(QueryStreamKeyFields.runtimePrefixLength(layout, 2)),
    ).toBe(3);
    const invalid = QueryStreamKeyFields.runtimePrefixLength(layout, 3);
    expect(Result.isFailure(invalid)).toBe(true);
    if (Result.isFailure(invalid))
      expect(invalid.failure.message).toContain(
        "prefix length 3 exceeds the order key",
      );
    expect(
      Result.getOrThrow(
        QueryStreamKeyFields.runtimePrefixLength(
          new QueryStreamKeyFields.QueryStreamKeyFields({ fields: [] }),
          0,
        ),
      ),
    ).toBe(0);
  });

  it("renames only visible fields without mutating the layout", () => {
    const layout = Object.freeze(
      QueryStreamKeyFields.concat(
        QueryStreamKeyFields.fromIndex(["text"]),
        QueryStreamKeyFields.fromIndex(["_creationTime"]),
      ),
    );
    Object.freeze(layout.fields);
    const renamed = Result.getOrThrow(
      QueryStreamKeyFields.rename(layout, ["body", "created"]),
    );
    expect(QueryStreamKeyFields.names(renamed)).toEqual([
      "body",
      "_id",
      "created",
      "_id",
    ]);
    expect(QueryStreamKeyFields.visibleKeyFields(renamed)).toEqual([
      "body",
      "created",
    ]);
    expect(QueryStreamKeyFields.names(layout)).toEqual([
      "text",
      "_id",
      "_creationTime",
      "_id",
    ]);
    const invalid = QueryStreamKeyFields.rename(layout, ["body"]);
    expect(Result.isFailure(invalid)).toBe(true);
    if (Result.isFailure(invalid))
      expect(invalid.failure.message).toContain("must have as many fields");
    expect(
      QueryStreamKeyFields.names(
        Result.getOrThrow(
          QueryStreamKeyFields.rename(QueryStreamKeyFields.fromIndex(["_id"]), [
            "id",
          ]),
        ),
      ),
    ).toEqual(["id"]);
    expect(
      QueryStreamKeyFields.names(
        Result.getOrThrow(
          QueryStreamKeyFields.rename(
            new QueryStreamKeyFields.QueryStreamKeyFields({ fields: [] }),
            [],
          ),
        ),
      ),
    ).toEqual([]);
  });

  it("keeps implicit IDs attached to their positions when equality pins fields", () => {
    const layout = QueryStreamKeyFields.fromIndex(["text", "_creationTime"]);
    const pinned = QueryStreamKeyFields.drop(layout, 2);
    expect(pinned.fields).toEqual([{ _tag: "ImplicitId" }]);
    expect(QueryStreamKeyFields.visibleKeyFields(pinned)).toEqual([]);
    expect(
      QueryStreamKeyFields.names(QueryStreamKeyFields.drop(pinned, 1)),
    ).toEqual([]);
    expect(
      QueryStreamKeyFields.drop(QueryStreamKeyFields.fromIndex(["_id"]), 1)
        .fields,
    ).toEqual([]);
    expect(QueryStreamKeyFields.names(layout)).toEqual([
      "text",
      "_creationTime",
      "_id",
    ]);
  });
});
