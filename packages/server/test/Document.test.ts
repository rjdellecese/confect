import type { GenericId } from "@confect/core/GenericId";
import * as SystemFields from "@confect/core/SystemFields";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "@effect/vitest";
import * as Document from "../src/Document";

const NoteSchema = Schema.Struct({
  content: Schema.String,
});

const convexNote = {
  content: "Hello, world!",
  _id: "abc123" as GenericId<"notes">,
  _creationTime: 1_234_567_890,
};

const decodeUncached = (
  tableName: "notes",
  tableSchema: typeof NoteSchema,
  convexDocument: typeof convexNote,
) =>
  Schema.decodeUnknownSync(
    SystemFields.extendWithSystemFields(tableName, tableSchema),
  )(convexDocument);

describe("Document.decode", () => {
  it("decodes documents identically to an uncached decoder", () => {
    const expected = decodeUncached("notes", NoteSchema, convexNote);

    const decoded = Effect.runSync(
      Document.decode(convexNote, "notes", NoteSchema),
    );

    expect(decoded).toEqual(expected);
  });

  it("returns the same output when decoding repeatedly with the same table schema", () => {
    const first = Effect.runSync(
      Document.decode(convexNote, "notes", NoteSchema),
    );
    const second = Effect.runSync(
      Document.decode(convexNote, "notes", NoteSchema),
    );
    const third = Effect.runSync(
      Document.decode(convexNote, "notes", NoteSchema),
    );

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("fails with DocumentDecodeError for invalid documents", () => {
    const invalidNote = {
      ...convexNote,
      content: 123,
    };

    const error = Effect.runSync(
      Document.decode(invalidNote, "notes", NoteSchema).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(Document.DocumentDecodeError);
    expect(error.tableName).toBe("notes");
    expect(error.id).toBe(convexNote._id);
  });
});
