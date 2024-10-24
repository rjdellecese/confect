import type { GenericDataModel, GenericTableInfo } from "convex/server";
import type { GenericId } from "convex/values";
import { Schema } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import type {
	DataModelFromConfectDataModel,
	GenericConfectDataModel,
	TableInfoFromConfectTableInfo,
} from "~/src/server/data-model";
import {
	type ConfectDataModelFromConfectSchema,
	type ConfectSchemaFromConfectSchemaDefinition,
	type GenericConfectSchema,
	defineSchema,
	defineTable,
} from "~/src/server/schema";

describe("ConfectDataModelFromConfectSchema", () => {
	test("extends GenericConfectDataModel and equals correct document and confectDocument types", () => {
		const TableSchema = Schema.Struct({
			content: Schema.String,
		});
		const confectTableDefinition = defineTable(TableSchema);
		const confectSchemaDefinition = defineSchema({
			notes: confectTableDefinition,
		});
		type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
			typeof confectSchemaDefinition
		>;

		type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

		expectTypeOf<ConfectDataModel>().toMatchTypeOf<GenericConfectDataModel>();
		expectTypeOf<ConfectDataModel["notes"]["confectDocument"]>().toEqualTypeOf<{
			readonly _id: GenericId<"notes">;
			readonly _creationTime: number;
			readonly content: string;
		}>();
		expectTypeOf<ConfectDataModel["notes"]["convexDocument"]>().toEqualTypeOf<{
			_id: GenericId<"notes">;
			_creationTime: number;
			content: string;
		}>();
	});
});

describe("ConfectSchemaFromConfectSchemaDefinition", () => {
	test("extends GenericConfectSchema", () => {
		const NoteSchema = Schema.Struct({
			content: Schema.String,
		});
		const notesTableDefinition = defineTable(NoteSchema);
		const schemaDefinition = defineSchema({
			notes: notesTableDefinition,
		});

		type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
			typeof schemaDefinition
		>;

		expectTypeOf<ConfectSchema>().toMatchTypeOf<GenericConfectSchema>();
	});
});

describe("TableInfoFromConfectTableInfo", () => {
	test("extends GenericTableInfo", () => {
		const TableSchema = Schema.Struct({
			content: Schema.String,
		});
		const confectTableDefinition = defineTable(TableSchema);
		const confectSchemaDefinition = defineSchema({
			notes: confectTableDefinition,
		});
		type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
			typeof confectSchemaDefinition
		>;
		type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;
		type ConfectTableInfo = ConfectDataModel["notes"];

		type TableInfo = TableInfoFromConfectTableInfo<ConfectTableInfo>;

		expectTypeOf<TableInfo>().toMatchTypeOf<GenericTableInfo>();
	});
});

describe("DataModelFromConfectDataModel", () => {
	test("extends GenericDataModel", () => {
		const TableSchema = Schema.Struct({
			content: Schema.String,
		});
		const confectTableDefinition = defineTable(TableSchema);
		const confectSchemaDefinition = defineSchema({
			notes: confectTableDefinition,
		});
		type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
			typeof confectSchemaDefinition
		>;
		type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

		type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

		expectTypeOf<DataModel>().toMatchTypeOf<GenericDataModel>();
	});
});
