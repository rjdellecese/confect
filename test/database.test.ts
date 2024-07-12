import { Schema } from "@effect/schema";
import { expectTypeOf, test } from "@effect/vitest";

import { extendWithIdAndSystemFields } from "~/src/data-model";
import { DatabaseSchemasFromConfectDataModel } from "~/src/database";
import {
  ConfectDataModelFromConfectSchema,
  defineConfectTable,
} from "~/src/schema";

test("DatabaseSchemasFromConfectDataModel", () => {
  const notesSchema = Schema.Struct({
    text: Schema.String,
    tags: Schema.Array(Schema.String).pipe(Schema.optional()),
  });
  const confectSchema = {
    notes: defineConfectTable(notesSchema),
  };
  type ConfectSchema = typeof confectSchema;
  type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

  type DatabaseSchemas = DatabaseSchemasFromConfectDataModel<ConfectDataModel>;

  const notesDocumentSchema =
    extendWithIdAndSystemFields<"notes">()(notesSchema);
  type NotesDocumentSchema = typeof notesDocumentSchema;

  type ExpectedDatabaseSchemas = {
    notes: NotesDocumentSchema;
  };

  expectTypeOf<Schema.Schema.Type<DatabaseSchemas["notes"]>>().toEqualTypeOf<
    Schema.Schema.Type<ExpectedDatabaseSchemas["notes"]>
  >();
  expectTypeOf<Schema.Schema.Encoded<DatabaseSchemas["notes"]>>().toEqualTypeOf<
    Schema.Schema.Encoded<ExpectedDatabaseSchemas["notes"]>
  >();
});
