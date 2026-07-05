import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as Tuple from "effect/Tuple";
import { describe, expect, expectTypeOf, test } from "vitest";
import type { GenericId } from "@confect/core/GenericId";
import * as SystemFields from "@confect/core/SystemFields";

describe("extendWithSystemFields", () => {
  describe("a struct table", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const ExtendedNoteSchema = SystemFields.extendWithSystemFields(
      "notes",
      NoteSchema,
    );

    test("decodes a document carrying the system fields", () => {
      const extendedNote = {
        content: "Hello, world!",
        _id: "abc123" as GenericId<"notes">,
        _creationTime: 1234567890,
      };

      expect(() =>
        Schema.decodeUnknownSync(ExtendedNoteSchema)(extendedNote),
      ).not.toThrow();
    });

    test("has the same type as the Schema.fieldsAssign combinator builds — a Struct, not a collapsed Codec — so the declared type cannot drift from the runtime", () => {
      const ViaFieldsAssign = Schema.fieldsAssign(
        SystemFields.SystemFields("notes").fields,
      )(NoteSchema);

      expectTypeOf<typeof ExtendedNoteSchema>().toEqualTypeOf<
        typeof ViaFieldsAssign
      >();
    });

    test("decodes and encodes _id as the branded id, never unknown", () => {
      expectTypeOf<(typeof ExtendedNoteSchema)["Type"]>().toEqualTypeOf<{
        readonly content: string;
        readonly _id: GenericId<"notes">;
        readonly _creationTime: number;
      }>();
      expectTypeOf<(typeof ExtendedNoteSchema)["Encoded"]>().toEqualTypeOf<{
        readonly content: string;
        readonly _id: GenericId<"notes">;
        readonly _creationTime: number;
      }>();
    });
  });

  describe("a union-of-structs table", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const ImageSchema = Schema.Struct({
      url: Schema.String,
    });

    const ItemSchema = Schema.Union([NoteSchema, ImageSchema]);

    const ExtendedItemSchema = SystemFields.extendWithSystemFields(
      "items",
      ItemSchema,
    );

    test("decodes a document for each union member", () => {
      const extendedNote = {
        content: "Hello, world!",
        _id: "abc123" as GenericId<"items">,
        _creationTime: 1234567890,
      };
      const extendedImage = {
        url: "https://example.com/image.jpg",
        _id: "def456" as GenericId<"items">,
        _creationTime: 1234567890,
      };

      expect(() =>
        Schema.decodeUnknownSync(ExtendedItemSchema)(extendedNote),
      ).not.toThrow();
      expect(() =>
        Schema.decodeUnknownSync(ExtendedItemSchema)(extendedImage),
      ).not.toThrow();
    });

    test("has the same type as the mapMembers + Tuple.map(fieldsAssign) combinator builds — a Union with every member extended — so the declared type cannot drift from the runtime", () => {
      const ViaMapMembers = ItemSchema.mapMembers(
        Tuple.map(
          Schema.fieldsAssign(SystemFields.SystemFields("items").fields),
        ),
      );

      expectTypeOf<typeof ExtendedItemSchema>().toEqualTypeOf<
        typeof ViaMapMembers
      >();
    });

    test("decodes and encodes to a union of both members carrying the system fields", () => {
      type Doc = {
        readonly content: string;
        readonly _id: GenericId<"items">;
        readonly _creationTime: number;
      };
      type Img = {
        readonly url: string;
        readonly _id: GenericId<"items">;
        readonly _creationTime: number;
      };

      expectTypeOf<(typeof ExtendedItemSchema)["Type"]>().toEqualTypeOf<
        Doc | Img
      >();
      expectTypeOf<(typeof ExtendedItemSchema)["Encoded"]>().toEqualTypeOf<
        Doc | Img
      >();
    });
  });

  describe("a transformed table (Schema.decodeTo)", () => {
    const StoredNote = Schema.Struct({ content: Schema.String });
    const Note = Schema.Struct({ length: Schema.Number });

    const NoteSchema = StoredNote.pipe(
      Schema.decodeTo(Note, {
        decode: SchemaGetter.transform((stored: { content: string }) => ({
          length: stored.content.length,
        })),
        encode: SchemaGetter.transform((note: { length: number }) => ({
          content: "x".repeat(note.length),
        })),
      }),
    );

    const ExtendedNoteSchema = SystemFields.extendWithSystemFields(
      "notes",
      NoteSchema,
    );

    const systemFields = {
      _id: "abc123" as GenericId<"notes">,
      _creationTime: 1234567890,
    };

    test("carries the system fields through the transformation when decoding", () => {
      expect(
        Schema.decodeUnknownSync(ExtendedNoteSchema)({
          content: "Hello",
          ...systemFields,
        }),
      ).toStrictEqual({ length: 5, ...systemFields });
    });

    test("carries the system fields back through the transformation when encoding", () => {
      expect(
        Schema.encodeUnknownSync(ExtendedNoteSchema)({
          length: 3,
          ...systemFields,
        }),
      ).toStrictEqual({ content: "xxx", ...systemFields });
    });

    test("fails to decode a document missing the system fields", () => {
      expect(() =>
        Schema.decodeUnknownSync(ExtendedNoteSchema)({ content: "Hello" }),
      ).toThrow();
    });

    test("decodes and encodes to the transformation's shapes carrying the system fields", () => {
      expectTypeOf<(typeof ExtendedNoteSchema)["Type"]>().toEqualTypeOf<
        SystemFields.WithSystemFields<"notes", { readonly length: number }>
      >();
      expectTypeOf<(typeof ExtendedNoteSchema)["Encoded"]>().toEqualTypeOf<
        SystemFields.WithSystemFields<"notes", { readonly content: string }>
      >();
    });
  });

  describe("a table with renamed encoded keys (Schema.encodeKeys)", () => {
    const NoteSchema = Schema.Struct({ name: Schema.String }).pipe(
      Schema.encodeKeys({ name: "full_name" }),
    );

    const ExtendedNoteSchema = SystemFields.extendWithSystemFields(
      "notes",
      NoteSchema,
    );

    const systemFields = {
      _id: "abc123" as GenericId<"notes">,
      _creationTime: 1234567890,
    };

    test("decodes from the encoded key, keeping the system fields", () => {
      expect(
        Schema.decodeUnknownSync(ExtendedNoteSchema)({
          full_name: "Ada",
          ...systemFields,
        }),
      ).toStrictEqual({ name: "Ada", ...systemFields });
    });

    test("encodes to the encoded key, keeping the system fields", () => {
      expect(
        Schema.encodeUnknownSync(ExtendedNoteSchema)({
          name: "Ada",
          ...systemFields,
        }),
      ).toStrictEqual({ full_name: "Ada", ...systemFields });
    });
  });

  describe("a union containing a transformed member", () => {
    const TransformedMember = Schema.Struct({ content: Schema.String }).pipe(
      Schema.decodeTo(Schema.Struct({ length: Schema.Number }), {
        decode: SchemaGetter.transform((stored: { content: string }) => ({
          length: stored.content.length,
        })),
        encode: SchemaGetter.transform((note: { length: number }) => ({
          content: "x".repeat(note.length),
        })),
      }),
    );

    const ItemSchema = Schema.Union([
      TransformedMember,
      Schema.Struct({ url: Schema.String }),
    ]);

    const ExtendedItemSchema = SystemFields.extendWithSystemFields(
      "items",
      ItemSchema,
    );

    const systemFields = {
      _id: "abc123" as GenericId<"items">,
      _creationTime: 1234567890,
    };

    test("decodes a document for each union member", () => {
      expect(
        Schema.decodeUnknownSync(ExtendedItemSchema)({
          content: "Hello",
          ...systemFields,
        }),
      ).toStrictEqual({ length: 5, ...systemFields });
      expect(
        Schema.decodeUnknownSync(ExtendedItemSchema)({
          url: "https://example.com",
          ...systemFields,
        }),
      ).toStrictEqual({ url: "https://example.com", ...systemFields });
    });
  });

  describe("a branded struct table", () => {
    const NoteSchema = Schema.Struct({ content: Schema.String }).pipe(
      Schema.brand("Note"),
    );

    const ExtendedNoteSchema = SystemFields.extendWithSystemFields(
      "notes",
      NoteSchema,
    );

    test("decodes a document carrying the system fields", () => {
      expect(
        Schema.decodeUnknownSync(ExtendedNoteSchema)({
          content: "Hello",
          _id: "abc123",
          _creationTime: 1234567890,
        }),
      ).toStrictEqual({
        content: "Hello",
        _id: "abc123",
        _creationTime: 1234567890,
      });
    });
  });

  describe("a suspended struct table", () => {
    const NoteSchema = Schema.suspend(() =>
      Schema.Struct({ content: Schema.String }),
    );

    const ExtendedNoteSchema = SystemFields.extendWithSystemFields(
      "notes",
      NoteSchema,
    );

    test("decodes a document carrying the system fields", () => {
      expect(
        Schema.decodeUnknownSync(ExtendedNoteSchema)({
          content: "Hello",
          _id: "abc123",
          _creationTime: 1234567890,
        }),
      ).toStrictEqual({
        content: "Hello",
        _id: "abc123",
        _creationTime: 1234567890,
      });
    });
  });

  describe("unsupported table schemas", () => {
    test("rejects a Schema.Class with a descriptive error", () => {
      class Note extends Schema.Class<Note>("Note")({
        content: Schema.String,
      }) {}

      expect(() => SystemFields.extendWithSystemFields("notes", Note)).toThrow(
        /Schema\.Class/,
      );
    });

    test("rejects a schema whose decoded side is not an object", () => {
      const NoteSchema = Schema.Struct({ content: Schema.String }).pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform(
            (stored: { content: string }) => stored.content,
          ),
          encode: SchemaGetter.transform((content: string) => ({ content })),
        }),
      );

      expect(() =>
        SystemFields.extendWithSystemFields("notes", NoteSchema),
      ).toThrow(/object shape/);
    });
  });
});
