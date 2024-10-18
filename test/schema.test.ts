import { Schema } from "@effect/schema";
import type { SystemDataModel } from "convex/server";
import { describe, expectTypeOf, test } from "vitest";

import type {
	DataModelFromConfectDataModel,
	GenericConfectDataModel,
} from "~/src/server/data-model";
import {
	type ConfectDataModelFromConfectSchema,
	type ConfectSystemDataModel,
	type ConfectTableDefinition,
	type confectSystemSchema,
	confectSystemSchemaDefinition,
	type confectTableSchemas,
	defineSchema,
	defineTable,
} from "~/src/server/schema";
import { extendWithSystemFields } from "~/src/server/schemas/SystemFields";

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

		const confectTableSchemas = defineSchema({
			notes: defineTable(NoteSchema),
		}).tableSchemas;

		type Actual = typeof confectTableSchemas;

		const expectedTableSchemas = {
			notes: schemaToTableSchemas("notes", NoteSchema),
			...systemTableSchemas,
		};

		type Expected = typeof expectedTableSchemas;

		expectTypeOf<Actual>().toEqualTypeOf<Expected>();
	});

	test("permits unions of structs", () => {
		const NoteSchema = Schema.Struct({
			content: Schema.String,
		});

		const ImageSchema = Schema.Struct({
			url: Schema.String,
		});

		const ItemSchema = Schema.Union(NoteSchema, ImageSchema);

		type ItemSchema = typeof ItemSchema;

		const confectTableSchemas = defineSchema({
			items: defineTable(ItemSchema),
		}).tableSchemas;

		type Actual = typeof confectTableSchemas;

		const expectedTableSchemas = {
			items: schemaToTableSchemas("items", ItemSchema),
			...systemTableSchemas,
		};

		type Expected = typeof expectedTableSchemas;

		expectTypeOf<Actual>().toEqualTypeOf<Expected>();
	});
});

describe("confectTableSchemas", () => {
	test("matches confectSystemSchema", () => {
		type ConfectTableSchemas = typeof confectTableSchemas;
		type ConfectSystemSchema = typeof confectSystemSchema;

		type ConfectTableSchemasFromConfectSystemSchema = {
			[K in keyof ConfectSystemSchema]: ConfectSystemSchema[K] extends ConfectTableDefinition<
				infer S,
				any,
				any,
				any,
				any
			>
				? S
				: never;
		};

		type Actual = ConfectTableSchemas;
		type Expected = ConfectTableSchemasFromConfectSystemSchema;

		expectTypeOf<Actual>().toEqualTypeOf<Expected>();
	});
});

const schemaToTableSchemas = <
	TableName extends string,
	TableSchema extends Schema.Schema.AnyNoContext,
>(
	name: TableName,
	schema: TableSchema,
) => ({
	withSystemFields: extendWithSystemFields(name, schema),
	withoutSystemFields: schema,
});

const systemTableSchemas = {
	_scheduled_functions: {
		withSystemFields: extendWithSystemFields(
			"_scheduled_functions",
			confectSystemSchemaDefinition.confectSchema._scheduled_functions
				.tableSchema,
		),
		withoutSystemFields:
			confectSystemSchemaDefinition.confectSchema._scheduled_functions
				.tableSchema,
	},
	_storage: {
		withSystemFields: extendWithSystemFields(
			"_storage",
			confectSystemSchemaDefinition.confectSchema._storage.tableSchema,
		),
		withoutSystemFields:
			confectSystemSchemaDefinition.confectSchema._storage.tableSchema,
	},
};
