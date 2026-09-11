import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("QueryStreamCursor schema", () => {
  it("defines the cursor envelope and its JSON codec", () => {
    const cursor = Schema.decodeSync(QueryStreamCursor.QueryStreamCursor)({
      version: 1,
      keyFields: ["text", "_creationTime", "_id"],
      key: ["apple", 1, "id"],
    });
    const serialized = Schema.encodeSync(QueryStreamCursor.Json)(cursor);

    expectTypeOf(cursor).toEqualTypeOf<QueryStreamCursor.QueryStreamCursor>();
    expectTypeOf<QueryStreamCursor.QueryStreamCursor>().toEqualTypeOf<{
      readonly version: 1;
      readonly keyFields: ReadonlyArray<string>;
      readonly key: ReadonlyArray<Schema.Json>;
    }>();
    expect(Schema.decodeSync(QueryStreamCursor.Json)(serialized)).toEqual(
      cursor,
    );
    expect(serialized).toBe(
      QueryStreamCursor.serialize(["apple", 1, "id"], cursor.keyFields),
    );
  });

  it.each([
    null,
    [],
    { version: 2, keyFields: ["text"], key: ["apple"] },
    { version: 1, keyFields: [1], key: ["apple"] },
    { version: 1, keyFields: ["text"], key: [] },
    { version: 1, keyFields: ["text"], key: [undefined] },
    { version: 1, keyFields: ["text"], key: [{ $integer: "invalid" }] },
    { version: 1, keyFields: ["text"], key: [{ $undefined: false }] },
    { version: 1, keyFields: ["text"], key: [{ $undefined: true, extra: 1 }] },
  ])("rejects an invalid envelope through the schema: %j", (input) => {
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(QueryStreamCursor.QueryStreamCursor)(input),
      ),
    ).toBe(true);
  });
});

describe("QueryStreamCursor serialization", () => {
  it("round-trips Convex values and missing fields with their layout", () => {
    const key: QueryStreamCursor.OrderKey = [
      undefined,
      null,
      true,
      "apple",
      1,
      2n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      new Uint8Array([1, 2, 3]).buffer,
      ["nested"],
      { nested: "value" },
    ];
    const fields = key.map((_, index) => `field${index}`);
    const cursor = QueryStreamCursor.serialize(key, fields);

    expect(JSON.parse(cursor)).toMatchObject({ version: 1, keyFields: fields });
    expect(QueryStreamCursor.deserialize(cursor)).toEqual(key);
    expect(QueryStreamCursor.deserialize(cursor, fields)).toEqual(key);
  });

  it("rejects serialization with mismatched key and field lengths", () => {
    expect(() => QueryStreamCursor.serialize([1], [])).toThrow(
      "key and fields must have the same length",
    );
  });

  it.each([
    "not-json",
    "null",
    "[]",
    '["apple",1,"id"]',
    '{"keyFields":["text"],"key":["apple"]}',
    '{"version":2,"keyFields":["text"],"key":["apple"]}',
    '{"version":1,"keyFields":"text","key":["apple"]}',
    '{"version":1,"keyFields":[1],"key":["apple"]}',
    '{"version":1,"keyFields":["text"],"key":"apple"}',
    '{"version":1,"keyFields":["text"],"key":[]}',
    '{"version":1,"keyFields":["text"],"key":[{"$integer":"invalid"}]}',
  ])("rejects malformed or unsupported cursor %s", (cursor) => {
    expect(() => QueryStreamCursor.deserialize(cursor)).toThrow(ConvexError);
  });

  it("validates field names and their order, not just their count", () => {
    const cursor = QueryStreamCursor.serialize(
      ["apple", 1, "id"],
      ["text", "_creationTime", "_id"],
    );

    for (const fields of [
      ["body", "_creationTime", "_id"],
      ["_creationTime", "text", "_id"],
      ["text", "_creationTime"],
    ]) {
      expect(() => QueryStreamCursor.deserialize(cursor, fields)).toThrow(
        ConvexError,
      );
    }
  });

  it("distinguishes an empty order key from the end sentinel", () => {
    const cursor = QueryStreamCursor.serialize([], []);

    expect(cursor).not.toBe(QueryStreamCursor.END_CURSOR);
    expect(QueryStreamCursor.deserialize(cursor, [])).toEqual([]);
  });
});
