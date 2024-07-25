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

describe("ConfectSystemDataModel", () => {
	test("when converted to a Convex DataModel, is equivalent to SystemDataModel", () => {
		type Actual = DataModelFromConfectDataModel<ConfectSystemDataModel>;
		type Expected = SystemDataModel;

		expectTypeOf<Actual>().toEqualTypeOf<Expected>();
	});
});
