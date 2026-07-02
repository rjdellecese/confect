import * as Schema from "effect/Schema";
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
});
