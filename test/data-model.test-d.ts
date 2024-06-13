import { Schema } from "@effect/schema";
import { GenericId } from "convex/values";
import { describe, expectTypeOf, test } from "vitest";

import { GenericConfectDataModel } from "~/src/data-model";
import {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaFromConfectSchemaDefinition,
  defineConfectSchema,
  defineConfectTable,
  GenericConfectSchema,
} from "~/src/schema";

describe("ConfectDataModelFromConfectSchema", () => {
  test("produces a well-formed type", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });
    const notesTableDefinition = defineConfectTable(NoteSchema);
    const schemaDefinition = defineConfectSchema({
      notes: notesTableDefinition,
    });
    type ConfectSchemaDefinition = ConfectSchemaFromConfectSchemaDefinition<
      typeof schemaDefinition
    >;

    type ConfectDataModel =
      ConfectDataModelFromConfectSchema<ConfectSchemaDefinition>;

    expectTypeOf<ConfectDataModel>().toMatchTypeOf<GenericConfectDataModel>();
    expectTypeOf<ConfectDataModel["notes"]["document"]>().toEqualTypeOf<{
      _id: GenericId<"notes">;
      _creationTime: number;
      content: string;
    }>();
    expectTypeOf<ConfectDataModel["notes"]["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
    }>();
  });
});

describe("ConfectSchemaFromConfectSchemaDefinition", () => {
  test("produces a well-formed type", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });
    const notesTableDefinition = defineConfectTable(NoteSchema);
    const schemaDefinition = defineConfectSchema({
      notes: notesTableDefinition,
    });

    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof schemaDefinition
    >;

    expectTypeOf<ConfectSchema>().toMatchTypeOf<GenericConfectSchema>();
  });
});
