import { Schema } from "@effect/schema";
import { v, Validator } from "convex/values";
import { describe, expectTypeOf, test } from "vitest";

import { GenericConfectDataModel } from "~/src/data-model";
import {
  ConfectDataModelFromConfectSchema,
  defineConfectTable,
  ValidatorFromTableSchema,
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

describe("ValidatorFromTableSchema", () => {
  test("produces a type which is assignable to Validator", () => {
    const confectTableDefinition = defineConfectTable(
      Schema.Struct({
        content: Schema.String,
      })
    );
    type ConfectTableDefinition = typeof confectTableDefinition;
    type TableSchema = ConfectTableDefinition["schema"];

    type TableValidator = ValidatorFromTableSchema<TableSchema>;

    const testValidator = v.object({ content: v.string() });
    type TestValidator = typeof testValidator;

    expectTypeOf<TableValidator>().toEqualTypeOf<
      Validator<{ content: string }, "required", any>
    >();
  });
});
