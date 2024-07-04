import { Schema } from "@effect/schema";
import { describe, expectTypeOf, test } from "vitest";

import { GenericConfectDataModel } from "~/src/data-model";
import {
  ConfectDataModelFromConfectSchema,
  defineConfectTable,
} from "~/src/schema";

describe("ConfectDataModelFromConfectSchema", () => {
  test("produces a type which is assignable to GenericConfectDataModel", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const notesTableDefinition = defineConfectTable(NoteSchema);

    type ConfectSchema = {
      notes: typeof notesTableDefinition;
    };

    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    expectTypeOf<ConfectDataModel>().toMatchTypeOf<GenericConfectDataModel>();
  });
});
