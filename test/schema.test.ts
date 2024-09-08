import { Schema } from "@effect/schema";
import type { SystemDataModel } from "convex/server";
import { describe, expectTypeOf, test } from "vitest";

import type {
	DataModelFromConfectDataModel,
	GenericConfectDataModel,
} from "~/src/data-model";
import {
	type ConfectDataModelFromConfectSchema,
	type ConfectSystemDataModel,
	confectSystemSchema,
	defineTable,
	tableSchemas,
} from "~/src/schema";
import { extendWithSystemFields } from "../src/schemas/SystemFields";

describe("ConfectDataModelFromConfectSchema", () => {
	test("produces a type which is assignable to GenericConfectDataModel", () => {
		const NoteSchema = Schema.Struct({
			content: Schema.String,
		});

		const notesTableDefinition = defineTable(NoteSchema);

		type ConfectSchema = {
			notes: typeof notesTableDefinition;
		};

		type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

		expectTypeOf<ConfectDataModel>().toMatchTypeOf<GenericConfectDataModel>();
	});
});

describe("ConfectSystemDataModel", () => {
	test("when converted to a Convex DataModel, is equivalent to SystemDataModel", () => {
		type Actual = DataModelFromConfectDataModel<ConfectSystemDataModel>;
		type Expected = SystemDataModel;

		expectTypeOf<Actual>().toEqualTypeOf<Expected>();
	});
});

describe("tableSchemas", () => {
	test("extends the table schemas with system fields", () => {
		const NoteSchema = Schema.Struct({
			content: Schema.String,
		});

		const confectTableSchemas = tableSchemas({
			notes: defineTable(NoteSchema),
		});

		type Actual = typeof confectTableSchemas;

		const expectedTableSchemas = {
			notes: {
				withSystemFields: extendWithSystemFields("notes", NoteSchema),
				withoutSystemFields: NoteSchema,
			},
			_scheduled_functions: {
				withSystemFields: extendWithSystemFields(
					"_scheduled_functions",
					confectSystemSchema.confectSchema._scheduled_functions.tableSchema,
				),
				withoutSystemFields:
					confectSystemSchema.confectSchema._scheduled_functions.tableSchema,
			},
			_storage: {
				withSystemFields: extendWithSystemFields(
					"_storage",
					confectSystemSchema.confectSchema._storage.tableSchema,
				),
				withoutSystemFields:
					confectSystemSchema.confectSchema._storage.tableSchema,
			},
		};

		type Expected = typeof expectedTableSchemas;

		expectTypeOf<Actual>().toEqualTypeOf<Expected>();
	});
});
