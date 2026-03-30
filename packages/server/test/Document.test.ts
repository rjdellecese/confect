import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect, Exit, Schema } from "effect";
import * as Document from "../src/Document";

const TestSchema = Schema.Struct({
  text: Schema.String,
  count: Schema.optionalWith(Schema.Number, { exact: true }),
});

describe("Document", () => {
  describe("decode", () => {
    it.effect("decodes a valid encoded document (data-first)", () =>
      Effect.gen(function* () {
        const encoded = {
          _id: "abc123" as any,
          _creationTime: 123456 as any,
          text: "hello",
        };
        const decoded = yield* Document.decode(encoded, "test", TestSchema);
        assertEquals(decoded.text, "hello");
        assertEquals(decoded._id, "abc123");
      }),
    );

    it.effect("decodes a valid encoded document (data-last)", () =>
      Effect.gen(function* () {
        const encoded = {
          _id: "abc123" as any,
          _creationTime: 123456 as any,
          text: "hello",
          count: 42,
        };
        const decoded = yield* Document.decode("test", TestSchema)(encoded);
        assertEquals(decoded.text, "hello");
        assertEquals(decoded.count, 42);
      }),
    );

    it.effect("fails with DocumentDecodeError on invalid data", () =>
      Effect.gen(function* () {
        const invalid = {
          _id: "bad" as any,
          _creationTime: 123456 as any,
          text: 999,
        };
        const exit = yield* Document.decode(
          invalid as any,
          "test",
          TestSchema,
        ).pipe(Effect.exit);
        assertTrue(Exit.isFailure(exit));
      }),
    );
  });

  describe("encode", () => {
    it.effect("encodes a valid document (data-first)", () =>
      Effect.gen(function* () {
        const doc = {
          _id: "abc123" as any,
          _creationTime: 123456 as any,
          text: "hello",
        };
        const encoded = yield* Document.encode(doc, "test", TestSchema);
        assertEquals(encoded.text, "hello");
      }),
    );

    it.effect("encodes a valid document (data-last)", () =>
      Effect.gen(function* () {
        const doc = {
          _id: "abc123" as any,
          _creationTime: 123456 as any,
          text: "hello",
          count: 10,
        };
        const encoded = yield* Document.encode("test", TestSchema)(doc);
        assertEquals(encoded.text, "hello");
        assertEquals(encoded.count, 10);
      }),
    );
  });

  describe("encode error path", () => {
    it.effect("fails with DocumentEncodeError on invalid data", () =>
      Effect.gen(function* () {
        const StrictSchema = Schema.Struct({
          name: Schema.String.pipe(Schema.pattern(/^[a-z]+$/)),
        });

        const invalidDoc = {
          _id: "id123" as any,
          _creationTime: 123 as any,
          name: "INVALID_UPPERCASE",
        };

        const exit = yield* Document.encode(
          invalidDoc as any,
          "test",
          StrictSchema,
        ).pipe(Effect.exit);
        assertTrue(Exit.isFailure(exit));
      }),
    );
  });

  describe("error messages", () => {
    it.effect("DocumentDecodeError has a descriptive message", () =>
      Effect.gen(function* () {
        const error = new Document.DocumentDecodeError({
          tableName: "notes",
          id: "doc123",
          parseError: "field 'text' is missing",
        });
        assertTrue(error.message.includes("doc123"));
        assertTrue(error.message.includes("notes"));
        assertTrue(error.message.includes("could not be decoded"));
        assertTrue(error.message.includes("field 'text' is missing"));
      }),
    );

    it.effect("DocumentEncodeError has a descriptive message", () =>
      Effect.gen(function* () {
        const error = new Document.DocumentEncodeError({
          tableName: "users",
          id: "user456",
          parseError: "invalid field type",
        });
        assertTrue(error.message.includes("user456"));
        assertTrue(error.message.includes("users"));
        assertTrue(error.message.includes("could not be encoded"));
        assertTrue(error.message.includes("invalid field type"));
      }),
    );

    it.effect("documentErrorMessage formats correctly", () =>
      Effect.gen(function* () {
        const msg = Document.documentErrorMessage({
          id: "id1",
          tableName: "tbl",
          message: "not found",
        });
        assertEquals(msg, "Document with ID 'id1' in table 'tbl' not found");
      }),
    );
  });
});
