import type { Expand } from "convex/server";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";
import { GenericId } from "../../src/server/schemas/GenericId";
import { extendWithSystemFields } from "../../src/server/schemas/SystemFields";

describe(extendWithSystemFields, () => {
  test("extends a struct with system fields", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const ExtendedNoteSchema = extendWithSystemFields("notes", NoteSchema);

    const Expected = Schema.Struct({
      content: Schema.String,
      _id: GenericId("notes"),
      _creationTime: Schema.Number,
    });

    type Expected = typeof Expected;

    const Actual = ExtendedNoteSchema;
    type Actual = typeof Actual;

    const extendedNote = {
      content: "Hello, world!",
      _id: "abc123" as GenericId<"notes">,
      _creationTime: 1234567890,
    };

    expect(() => Schema.decodeUnknownSync(Actual)(extendedNote)).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Expected)(extendedNote),
    ).not.toThrow();

    expectTypeOf<Expand<Actual["Encoded"]>>().toEqualTypeOf<
      Expected["Encoded"]
    >();
    expectTypeOf<Expand<Actual["Type"]>>().toEqualTypeOf<Expected["Type"]>();
  });

  test("extends a union of structs with system fields", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const ImageSchema = Schema.Struct({
      url: Schema.String,
    });

    const ItemSchema = Schema.Union(NoteSchema, ImageSchema);

    const ExtendedItemSchema = extendWithSystemFields("items", ItemSchema);

    const Expected = Schema.Union(
      Schema.Struct({
        content: Schema.String,
        _id: GenericId("items"),
        _creationTime: Schema.Number,
      }),
      Schema.Struct({
        url: Schema.String,
        _id: GenericId("items"),
        _creationTime: Schema.Number,
      }),
    );

    type Expected = typeof Expected;

    const Actual = ExtendedItemSchema;
    type Actual = typeof Actual;

    const extendedNote = {
      content: "Hello, world!",
      _id: "abc123" as GenericId<"items">,
      _creationTime: 1234567890,
    };

    expect(() => Schema.decodeUnknownSync(Actual)(extendedNote)).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Expected)(extendedNote),
    ).not.toThrow();

    const extendedImage = {
      url: "https://example.com/image.jpg",
      _id: "def456" as GenericId<"items">,
      _creationTime: 1234567890,
    };

    expect(() => Schema.decodeUnknownSync(Actual)(extendedImage)).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(Expected)(extendedImage),
    ).not.toThrow();

    expectTypeOf<Expand<Actual["Encoded"]>>().toEqualTypeOf<
      Expected["Encoded"]
    >();
    expectTypeOf<Expand<Actual["Type"]>>().toEqualTypeOf<Expected["Type"]>();
  });
});
