import { expectTypeOf, test } from "@effect/vitest";
import { Schema } from "effect";

import type { DatabaseSchemasFromConfectDataModel } from "~/src/server/database";
import {
	type ConfectDataModelFromConfectSchema,
	defineTable,
} from "~/src/server/schema";
import { Id } from "~/src/server/schemas/Id";

test("DatabaseSchemasFromConfectDataModel", () => {
	const notesSchemaFields = {
		text: Schema.String,
		tags: Schema.optional(Schema.Array(Schema.String)),
	};
	const confectSchema = {
		notes: defineTable(Schema.Struct(notesSchemaFields)),
	};
	type ConfectSchema = typeof confectSchema;
	type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

	type DatabaseSchemas = DatabaseSchemasFromConfectDataModel<ConfectDataModel>;

	const notesDocumentSchema = Schema.Struct({
		_id: Id("notes"),
		_creationTime: Schema.Number,
		...notesSchemaFields,
	});
	type NotesDocumentSchema = typeof notesDocumentSchema;

	type ExpectedDatabaseSchemas = {
		notes: NotesDocumentSchema;
	};

	type ActualNotesSchemaType = DatabaseSchemas["notes"]["Type"];
	type ExpectedNotesSchemaType = ExpectedDatabaseSchemas["notes"]["Type"];
	expectTypeOf<ActualNotesSchemaType>().toEqualTypeOf<ExpectedNotesSchemaType>();

	type ActualNotesSchemaEncoded = DatabaseSchemas["notes"]["Encoded"];
	type ExpectedNotesSchemaEncoded = ExpectedDatabaseSchemas["notes"]["Encoded"];
	expectTypeOf<ActualNotesSchemaEncoded>().toEqualTypeOf<ExpectedNotesSchemaEncoded>();
});
