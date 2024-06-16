import { Schema } from "@effect/schema";
import { GenericId } from "convex/values";
import { describe, expect, expectTypeOf, test } from "vitest";

import { SchemaGenericId } from "~/src/SchemaGenericId";

describe("SchemaGenericId", () => {
  test("decodes a string into a GenericId<TableName>", () => {
    const notesIdString = "3e6kr34gy9t97gkk44tp625w9gj9qdr";
    const notesGenericId =
      Schema.decodeSync(SchemaGenericId<"notes">())(notesIdString);

    expectTypeOf<typeof notesGenericId>().toMatchTypeOf<GenericId<"notes">>();
    expect(typeof notesGenericId).toEqual("string");
  });

  test("encodes a GenericId<TableName> into a string", () => {
    const notesGenericId =
      "3e6kr34gy9t97gkk44tp625w9gj9qdr" as GenericId<"notes">;
    const notesIdString =
      Schema.encodeSync(SchemaGenericId<"notes">())(notesGenericId);

    expectTypeOf<typeof notesIdString>().toMatchTypeOf<string>();
    expect(typeof notesIdString).toEqual("string");
  });
});
