import { identity } from "effect/Function";
import * as QueryStreamKey from "@confect/server/QueryStreamKey";
import * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import * as QueryStreamKeyValues from "@confect/server/QueryStreamKeyValues";
import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

const complete = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  values: QueryStreamKeyValues.QueryStreamKeyValues,
) => Result.getOrThrowWith(QueryStreamKey.complete(layout, values), identity);
const encodeCursor =
  (layout: QueryStreamKeyLayout.QueryStreamKeyLayout) =>
  (values: QueryStreamKeyValues.QueryStreamKeyValues) =>
    Schema.encodeSync(QueryStreamCursor.fromKeyLayout(layout))(
      complete(layout, values),
    );

describe("QueryStreamCursor schema", () => {
  it("defines the cursor envelope and its JSON codec", () => {
    const cursor = Schema.decodeSync(QueryStreamCursor.QueryStreamCursor)({
      version: 1,
      runtimeLabels: ["text", "_creationTime", "_id"],
      keyValues: ["apple", 1, "id"],
    });
    const serialized = Schema.encodeSync(QueryStreamCursor.Json)(cursor);
    const legacyCursor =
      '{"version":1,"keyFields":["text","_creationTime","_id"],"orderKey":["apple",1,"id"]}';
    expect(serialized).toBe(legacyCursor);
    expect(Schema.decodeSync(QueryStreamCursor.Json)(legacyCursor)).toEqual(
      cursor,
    );

    expect(cursor).toEqual({
      version: 1,
      runtimeLabels: ["text", "_creationTime", "_id"],
      keyValues: ["apple", 1, "id"],
    });
    expectTypeOf(cursor).toEqualTypeOf<QueryStreamCursor.QueryStreamCursor>();
    expectTypeOf<QueryStreamCursor.QueryStreamCursor>().toEqualTypeOf<{
      readonly version: 1;
      readonly runtimeLabels: ReadonlyArray<string>;
      readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
    }>();
    expect(Schema.decodeSync(QueryStreamCursor.Json)(serialized)).toEqual(
      cursor,
    );
    expect(serialized).toBe(
      encodeCursor(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
          identity,
        ),
      )(["apple", 1, "id"]),
    );
  });

  it.effect("checks runtime label and value counts during construction", () =>
    Effect.gen(function* () {
      const error = yield* QueryStreamCursor.QueryStreamCursor.makeEffect({
        version: 1,
        runtimeLabels: ["text"],
        keyValues: [],
      }).pipe(Effect.flip);
      expect(SchemaIssue.isIssue(error)).toBe(true);
    }),
  );

  it.each([
    null,
    [],
    { version: 2, runtimeLabels: ["text"], keyValues: ["apple"] },
    { version: 1, runtimeLabels: [1], keyValues: ["apple"] },
    { version: 1, runtimeLabels: ["text"], keyValues: [] },
    { version: 1, runtimeLabels: ["text"], keyValues: [undefined] },
    {
      version: 1,
      runtimeLabels: ["text"],
      keyValues: [{ $integer: "invalid" }],
    },
    { version: 1, runtimeLabels: ["text"], keyValues: [{ $undefined: false }] },
    {
      version: 1,
      runtimeLabels: ["text"],
      keyValues: [{ $undefined: true, extra: 1 }],
    },
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
    const keyValues: QueryStreamKeyValues.QueryStreamKeyValues = [
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
    const fieldPaths = keyValues.map((_, index) =>
      index === keyValues.length - 1 ? "_id" : `field${index}`,
    );
    const layout = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(fieldPaths),
      identity,
    );
    const cursor = encodeCursor(layout)(keyValues);

    expect(
      Schema.is(QueryStreamKeyValues.QueryStreamKeyValues)(keyValues),
    ).toBe(true);
    expect(JSON.parse(cursor)).toMatchObject({
      version: 1,
      keyFields: fieldPaths,
    });
    expect(Schema.decodeSync(QueryStreamCursor.Json)(cursor).keyValues).toEqual(
      keyValues,
    );
    expect(
      QueryStreamKey.values(
        Schema.decodeSync(QueryStreamCursor.fromKeyLayout(layout))(cursor),
      ),
    ).toEqual(keyValues);
  });

  it("serializes aliases and every implicit ID without changing the cursor envelope", () => {
    const layout = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        QueryStreamKeyLayout.concat(
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["author.role", "_creationTime"], 1),
            identity,
          ),
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["text"]),
            identity,
          ),
        ),
        QueryStreamKeyLabels.make(["created", "body"]),
      ),
    );
    const codec = QueryStreamCursor.fromKeyLayout(layout);
    const keyValues = [123, "outer-id", "hello", "inner-id"];
    const encoded = Schema.encodeSync(codec)(complete(layout, keyValues));
    expect(JSON.parse(encoded)).toEqual({
      version: 1,
      keyFields: ["created", "_id", "body", "_id"],
      orderKey: keyValues,
    });
    expect(QueryStreamKey.values(Schema.decodeSync(codec)(encoded))).toEqual(
      keyValues,
    );
  });

  it("preserves the existing wire projection for explicit and implicit ID labels", () => {
    const explicit = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"]),
      identity,
    );
    const implicit = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex([]),
      identity,
    );
    expect(QueryStreamKeyLayout.Equivalence(explicit, implicit)).toBe(false);
    const serialized = encodeCursor(explicit)(["id"]);
    expect(encodeCursor(implicit)(["id"])).toBe(serialized);
  });

  it("requires a complete key belonging to the encoder's layout", () => {
    const layout = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["text"]));
    const other = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["body"]));
    const codec = QueryStreamCursor.fromKeyLayout(layout);
    const encode = Schema.encodeSync(codec);
    expectTypeOf(encode).parameter(0).toEqualTypeOf<QueryStreamKey.Complete>();
    expect(() => encode(complete(other, ["hello", "id"]))).toThrow(
      "Cursor key does not belong to the stream layout",
    );
    expect(
      Result.isFailure(Schema.encodeUnknownResult(codec)(["hello", "id"])),
    ).toBe(true);
    const decoded = Schema.decodeSync(codec)(
      encode(complete(layout, ["hello", "id"])),
    );
    expect(QueryStreamKey.layout(decoded)).toBe(layout);
    expect(QueryStreamKey.values(decoded)).toEqual(["hello", "id"]);
  });

  it.each([
    "not-json",
    "null",
    "[]",
    '["apple",1,"id"]',
    '{"keyFields":["text"],"orderKey":["apple"]}',
    '{"version":2,"keyFields":["text"],"orderKey":["apple"]}',
    '{"version":1,"keyFields":"text","orderKey":["apple"]}',
    '{"version":1,"keyFields":[1],"orderKey":["apple"]}',
    '{"version":1,"keyFields":["text"],"orderKey":"apple"}',
    '{"version":1,"keyFields":["text"],"orderKey":[]}',
    '{"version":1,"keyFields":["text"],"orderKey":[{"$integer":"invalid"}]}',
  ])("rejects malformed or unsupported cursor %s", (cursor) => {
    expect(
      () => Schema.decodeSync(QueryStreamCursor.Json)(cursor).keyValues,
    ).toThrow(Schema.SchemaError);
  });

  it("validates runtime labels and their order, not just their count", () => {
    const cursor = encodeCursor(
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
        identity,
      ),
    )(["apple", 1, "id"]);

    for (const layout of [
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["body", "_creationTime"]),
        identity,
      ),
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["_creationTime", "text"]),
        identity,
      ),
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["text"]), identity),
    ]) {
      expect(() =>
        QueryStreamKey.values(
          Schema.decodeSync(QueryStreamCursor.fromKeyLayout(layout))(cursor),
        ),
      ).toThrow(Schema.SchemaError);
    }
  });

  it("distinguishes an empty key from the end sentinel", () => {
    const cursor = encodeCursor(
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["_id"], 1),
        identity,
      ),
    )([]);

    expect(cursor).not.toBe(QueryStreamCursor.END_CURSOR);
    expect(
      QueryStreamKey.values(
        Schema.decodeSync(
          QueryStreamCursor.fromKeyLayout(
            Result.getOrThrowWith(
              QueryStreamKeyLayout.fromIndex(["_id"], 1),
              identity,
            ),
          ),
        )(cursor),
      ),
    ).toEqual([]);
  });

  it.effect(
    "round-trips native cursor values through the standard effectful schema APIs",
    () =>
      Effect.gen(function* () {
        const value = yield* QueryStreamCursor.QueryStreamCursor.makeEffect({
          version: 1,
          runtimeLabels: ["optional", "integer", "bytes"],
          keyValues: [undefined, 42n, new Uint8Array([1, 2]).buffer],
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
          keyFields: value.runtimeLabels,
          orderKey: [
            { $undefined: true },
            { $integer: "KgAAAAAAAAA=" },
            { $bytes: "AQI=" },
          ],
        });

        const layout = Result.getOrThrow(
          QueryStreamKeyLayout.rename(
            Result.getOrThrowWith(
              QueryStreamKeyLayout.fromIndex(["optional", "integer", "_id"]),
              identity,
            ),
            QueryStreamKeyLabels.make(["optional", "integer", "bytes"]),
          ),
        );
        const bound = QueryStreamCursor.fromKeyLayout(layout);
        expectTypeOf<
          typeof bound.Type
        >().toEqualTypeOf<QueryStreamKey.Complete>();
        expectTypeOf<typeof bound.Encoded>().toEqualTypeOf<string>();
        expect(
          QueryStreamKey.values(yield* Schema.decodeEffect(bound)(encoded)),
        ).toEqual(value.keyValues);
        expect(
          yield* Schema.encodeEffect(bound)(complete(layout, value.keyValues)),
        ).toBe(encoded);
      }),
  );
});
