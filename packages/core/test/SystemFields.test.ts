import * as Schema from "effect/Schema";
import * as Tuple from "effect/Tuple";
import { describe, expect, expectTypeOf, test } from "vitest";
import { GenericId } from "@confect/core/GenericId";
import * as SystemFields from "@confect/core/SystemFields";

describe("extendWithSystemFields", () => {
  test("extends a struct with system fields", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const ExtendedNoteSchema = SystemFields.extendWithSystemFields(
      "notes",
      NoteSchema,
    );

    const extendedNote = {
      content: "Hello, world!",
      _id: "abc123" as GenericId<"notes">,
      _creationTime: 1234567890,
    };

    expect(() =>
      Schema.decodeUnknownSync(ExtendedNoteSchema)(extendedNote),
    ).not.toThrow();

    // Drift guard: the declared type must stay identical to what the documented
    // runtime operation (`Schema.fieldsAssign`) actually builds. If
    // `ExtendWithSystemFields` and `extendWithSystemFields` diverge, this fails.
    const ViaFieldsAssign = Schema.fieldsAssign(
      SystemFields.SystemFields("notes").fields,
    )(NoteSchema);
    expectTypeOf<typeof ExtendedNoteSchema>().toEqualTypeOf<
      typeof ViaFieldsAssign
    >();

    // The result preserves `Struct` structure (rather than collapsing to `Codec`).
    expectTypeOf(ExtendedNoteSchema.fields).toEqualTypeOf<{
      readonly content: typeof Schema.String;
      readonly _id: ReturnType<typeof GenericId<"notes">>;
      readonly _creationTime: typeof Schema.Number;
    }>();

    // Document shape: decoded and encoded `_id` are the branded id (not `unknown`).
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

  test("extends a union of structs with system fields", () => {
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

    // Drift guard: distributing the system fields across the union members is the
    // documented idiom (`union.mapMembers(Tuple.map(Schema.fieldsAssign(...)))`).
    // The declared type must equal what that operation produces.
    const ViaMapMembers = ItemSchema.mapMembers(
      Tuple.map(Schema.fieldsAssign(SystemFields.SystemFields("items").fields)),
    );
    expectTypeOf<typeof ExtendedItemSchema>().toEqualTypeOf<
      typeof ViaMapMembers
    >();

    // The result preserves `Union` structure with both members extended.
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
