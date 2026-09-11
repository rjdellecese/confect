import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
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

    expect(cursor).toBeInstanceOf(QueryStreamCursor.QueryStreamCursor);
    expectTypeOf(cursor).toEqualTypeOf<QueryStreamCursor.QueryStreamCursor>();
    expectTypeOf<QueryStreamCursor.QueryStreamCursor>().toEqualTypeOf<{
      readonly version: 1;
      readonly keyFields: ReadonlyArray<string>;
      readonly key: QueryStreamCursor.OrderKey;
    }>();
    expect(Schema.decodeSync(QueryStreamCursor.Json)(serialized)).toEqual(
      cursor,
    );
    expect(
      Schema.decodeSync(QueryStreamCursor.Json)(serialized),
    ).toBeInstanceOf(QueryStreamCursor.QueryStreamCursor);
    expect(serialized).toBe(
      Schema.encodeSync(QueryStreamCursor.forKeyFields(cursor.keyFields))([
        "apple",
        1,
        "id",
      ]),
    );
  });

  it("validates the key layout during class construction", () => {
    expect(
      () =>
        new QueryStreamCursor.QueryStreamCursor({
          version: 1,
          keyFields: ["text"],
          key: [],
        }),
    ).toThrow("Schema validation failed");
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
        Schema.decodeUnknownResult(
          Schema.toCodecJson(QueryStreamCursor.QueryStreamCursor),
        )(input),
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
    const cursor = Schema.encodeSync(QueryStreamCursor.forKeyFields(fields))(
      key,
    );

    expect(Schema.is(QueryStreamCursor.OrderKey)(key)).toBe(true);
    expect(JSON.parse(cursor)).toMatchObject({ version: 1, keyFields: fields });
    expect(Schema.decodeSync(QueryStreamCursor.Json)(cursor).key).toEqual(key);
    expect(
      Schema.decodeSync(QueryStreamCursor.forKeyFields(fields))(cursor),
    ).toEqual(key);
  });

  it("rejects serialization with mismatched key and field lengths", () => {
    expect(() =>
      Schema.encodeSync(QueryStreamCursor.forKeyFields([]))([1]),
    ).toThrow("key and fields must have the same length");
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
    expect(() => Schema.decodeSync(QueryStreamCursor.Json)(cursor).key).toThrow(
      Schema.SchemaError,
    );
  });

  it("validates field names and their order, not just their count", () => {
    const cursor = Schema.encodeSync(
      QueryStreamCursor.forKeyFields(["text", "_creationTime", "_id"]),
    )(["apple", 1, "id"]);

    for (const fields of [
      ["body", "_creationTime", "_id"],
      ["_creationTime", "text", "_id"],
      ["text", "_creationTime"],
    ]) {
      expect(() =>
        Schema.decodeSync(QueryStreamCursor.forKeyFields(fields))(cursor),
      ).toThrow(Schema.SchemaError);
    }
  });

  it("distinguishes an empty order key from the end sentinel", () => {
    const cursor = Schema.encodeSync(QueryStreamCursor.forKeyFields([]))([]);

    expect(cursor).not.toBe(QueryStreamCursor.END_CURSOR);
    expect(
      Schema.decodeSync(QueryStreamCursor.forKeyFields([]))(cursor),
    ).toEqual([]);
  });

  it.effect(
    "round-trips native cursor values through the standard effectful schema APIs",
    () =>
      Effect.gen(function* () {
        const value = yield* QueryStreamCursor.QueryStreamCursor.makeEffect({
          version: 1,
          keyFields: ["optional", "integer", "bytes"],
          key: [undefined, 42n, new Uint8Array([1, 2]).buffer],
        });
        const encoded = yield* Schema.encodeEffect(QueryStreamCursor.Json)(
          value,
        );
        const decoded = yield* Schema.decodeEffect(QueryStreamCursor.Json)(
          encoded,
        );
        expect(decoded).toEqual(value);
        const wire = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Json),
        )(encoded);
        expect(wire).toEqual({
          version: 1,
          keyFields: value.keyFields,
          key: [
            { $undefined: true },
            { $integer: "KgAAAAAAAAA=" },
            { $bytes: "AQI=" },
          ],
        });

        const bound = QueryStreamCursor.forKeyFields(value.keyFields);
        expectTypeOf<
          typeof bound.Type
        >().toEqualTypeOf<QueryStreamCursor.OrderKey>();
        expectTypeOf<typeof bound.Encoded>().toEqualTypeOf<string>();
        expect(yield* Schema.decodeEffect(bound)(encoded)).toEqual(value.key);
        expect(yield* Schema.encodeEffect(bound)(value.key)).toBe(encoded);
      }),
  );
});
