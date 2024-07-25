import { Schema } from "@effect/schema";
import {
	type Expand,
	type GenericSchema,
	type GenericTableIndexes,
	type GenericTableSearchIndexes,
	type GenericTableVectorIndexes,
	type IdField,
	type IndexTiebreakerField,
	type SchemaDefinition,
	type SearchIndexConfig,
	type SystemFields,
	type SystemIndexes,
	type TableDefinition,
	type VectorIndexConfig,
	defineSchema,
	defineTable,
} from "convex/server";
import type { Validator } from "convex/values";
import { Record, pipe } from "effect";
import type { ReadonlyDeep } from "type-fest";

import { compileTableSchema } from "~/src/schema-to-validator-compiler";

export type GenericConfectSchema = Record<
	string,
	GenericConfectTableDefinition
>;

export type GenericConfectSchemaDefinition = ConfectSchemaDefinition<
	GenericSchema,
	GenericConfectSchema
>;

export interface ConfectSchemaDefinition<
	ConvexSchema extends GenericSchema,
	ConfectSchema extends GenericConfectSchema,
> {
	confectSchema: ConfectSchema;
	schemaDefinition: SchemaDefinition<ConvexSchema, true>;
}

class ConfectSchemaDefinitionImpl<
	ConvexSchema extends GenericSchema,
	ConfectSchema extends GenericConfectSchema,
> implements ConfectSchemaDefinition<ConvexSchema, ConfectSchema>
{
	confectSchema: ConfectSchema;
	schemaDefinition: SchemaDefinition<ConvexSchema, true>;

	constructor(confectSchema: ConfectSchema) {
		this.confectSchema = confectSchema;
		this.schemaDefinition = pipe(
			confectSchema,
			Record.map(({ tableDefinition }) => tableDefinition),
			defineSchema,
		) as SchemaDefinition<ConvexSchema, true>;
	}
}

type SchemaDefinitionFromConfectSchemaDefinition<
	ConfectSchema extends GenericConfectSchema,
> = Expand<{
	[TableName in keyof ConfectSchema &
		string]: ConfectSchema[TableName]["tableDefinition"];
}>;

export const defineConfectSchema = <ConfectSchema extends GenericConfectSchema>(
	confectSchema: ConfectSchema,
): ConfectSchemaDefinitionImpl<
	SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
	ConfectSchema
> =>
	new ConfectSchemaDefinitionImpl<
		SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
		ConfectSchema
	>(confectSchema);

export type GenericConfectTableDefinition = ConfectTableDefinition<
	any,
	any,
	any,
	any,
	any
>;

export interface ConfectTableDefinition<
	TableSchema extends Schema.Schema<any, any>,
	TableValidator extends Validator<any, any, any>,
	// biome-ignore lint/complexity/noBannedTypes:
	Indexes extends GenericTableIndexes = {},
	// biome-ignore lint/complexity/noBannedTypes:
	SearchIndexes extends GenericTableSearchIndexes = {},
	// biome-ignore lint/complexity/noBannedTypes:
	VectorIndexes extends GenericTableVectorIndexes = {},
> {
	tableDefinition: TableDefinition<
		TableValidator,
		Indexes,
		SearchIndexes,
		VectorIndexes
	>;
	tableSchema: TableSchema;

	index<
		IndexName extends string,
		FirstFieldPath extends ExtractFieldPaths<TableValidator>,
		RestFieldPaths extends ExtractFieldPaths<TableValidator>[],
	>(
		name: IndexName,
		fields: [FirstFieldPath, ...RestFieldPaths],
	): ConfectTableDefinition<
		TableSchema,
		TableValidator,
		Expand<
			Indexes &
				Record<
					IndexName,
					[FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]
				>
		>,
		SearchIndexes,
		VectorIndexes
	>;
	searchIndex<
		IndexName extends string,
		SearchField extends ExtractFieldPaths<TableValidator>,
		FilterFields extends ExtractFieldPaths<TableValidator> = never,
	>(
		name: IndexName,
		indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>,
	): ConfectTableDefinition<
		TableSchema,
		TableValidator,
		Indexes,
		Expand<
			SearchIndexes &
				Record<
					IndexName,
					{
						searchField: SearchField;
						filterFields: FilterFields;
					}
				>
		>,
		VectorIndexes
	>;
	vectorIndex<
		IndexName extends string,
		VectorField extends ExtractFieldPaths<TableValidator>,
		FilterFields extends ExtractFieldPaths<TableValidator> = never,
	>(
		name: IndexName,
		indexConfig: Expand<VectorIndexConfig<VectorField, FilterFields>>,
	): ConfectTableDefinition<
		TableSchema,
		TableValidator,
		Indexes,
		SearchIndexes,
		Expand<
			VectorIndexes &
				Record<
					IndexName,
					{
						vectorField: VectorField;
						dimensions: number;
						filterFields: FilterFields;
					}
				>
		>
	>;
}

export type ConfectSchemaFromConfectSchemaDefinition<
	ConfectSchemaDef extends GenericConfectSchemaDefinition,
> = ConfectSchemaDef extends ConfectSchemaDefinition<
	infer _ConvexSchema,
	infer ConfectSchema
>
	? ConfectSchema
	: never;

export type ConfectDataModelFromConfectSchemaDefinition<
	ConfectSchemaDef extends GenericConfectSchemaDefinition,
> = ConfectSchemaDef extends ConfectSchemaDefinition<
	infer _ConvexSchema,
	infer ConfectSchema
>
	? ConfectDataModelFromConfectSchema<ConfectSchema>
	: never;

class ConfectTableDefinitionImpl<
	TableSchema extends Schema.Schema<any, any>,
	TableValidator extends Validator<any, any, any>,
	// biome-ignore lint/complexity/noBannedTypes:
	Indexes extends GenericTableIndexes = {},
	// biome-ignore lint/complexity/noBannedTypes:
	SearchIndexes extends GenericTableSearchIndexes = {},
	// biome-ignore lint/complexity/noBannedTypes:
	VectorIndexes extends GenericTableVectorIndexes = {},
> implements
		ConfectTableDefinition<
			TableSchema,
			TableValidator,
			Indexes,
			SearchIndexes,
			VectorIndexes
		>
{
	tableSchema: TableSchema;
	tableDefinition: TableDefinition<
		TableValidator,
		Indexes,
		SearchIndexes,
		VectorIndexes
	>;

	constructor(tableSchema: TableSchema, tableValidator: TableValidator) {
		this.tableSchema = tableSchema;
		this.tableDefinition = defineTable(tableValidator);
	}

	index<
		IndexName extends string,
		FirstFieldPath extends ExtractFieldPaths<TableValidator>,
		RestFieldPaths extends ExtractFieldPaths<TableValidator>[],
	>(
		name: IndexName,
		fields: [FirstFieldPath, ...RestFieldPaths],
	): ConfectTableDefinition<
		TableSchema,
		TableValidator,
		Expand<
			Indexes &
				Record<
					IndexName,
					[FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]
				>
		>,
		SearchIndexes,
		VectorIndexes
	> {
		this.tableDefinition = this.tableDefinition.index(name, fields);

		return this;
	}

	searchIndex<
		IndexName extends string,
		SearchField extends ExtractFieldPaths<TableValidator>,
		FilterFields extends ExtractFieldPaths<TableValidator> = never,
	>(
		name: IndexName,
		indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>,
	): ConfectTableDefinition<
		TableSchema,
		TableValidator,
		Indexes,
		Expand<
			SearchIndexes &
				Record<
					IndexName,
					{
						searchField: SearchField;
						filterFields: FilterFields;
					}
				>
		>,
		VectorIndexes
	> {
		this.tableDefinition = this.tableDefinition.searchIndex(name, indexConfig);

		return this;
	}

	vectorIndex<
		IndexName extends string,
		VectorField extends ExtractFieldPaths<TableValidator>,
		FilterFields extends ExtractFieldPaths<TableValidator> = never,
	>(
		name: IndexName,
		indexConfig: {
			vectorField: VectorField;
			dimensions: number;
			filterFields?: FilterFields[] | undefined;
		},
	): ConfectTableDefinition<
		TableSchema,
		TableValidator,
		Indexes,
		SearchIndexes,
		Expand<
			VectorIndexes &
				Record<
					IndexName,
					{
						vectorField: VectorField;
						dimensions: number;
						filterFields: FilterFields;
					}
				>
		>
	> {
		this.tableDefinition = this.tableDefinition.vectorIndex(name, indexConfig);

		return this;
	}
}

export const defineConfectTable = <A, I>(tableSchema: Schema.Schema<A, I>) => {
	const tableValidator = compileTableSchema(tableSchema);
	return new ConfectTableDefinitionImpl(tableSchema, tableValidator);
};

export type TableNamesInConfectSchema<
	ConfectSchema extends GenericConfectSchema,
> = keyof ConfectSchema & string;

export type ConfectDataModelFromConfectSchema<
	ConfectSchema extends GenericConfectSchema,
> = {
	[TableName in keyof ConfectSchema &
		string]: ConfectSchema[TableName] extends ConfectTableDefinition<
		infer TableSchema,
		infer TableValidator,
		infer Indexes,
		infer SearchIndexes,
		infer VectorIndexes
	>
		? TableSchema extends Schema.Schema<any, any>
			? {
					confectDocument: ExtractConfectDocument<TableName, TableSchema>;
					convexDocument: ExtractDocument<TableName, TableValidator>;
					fieldPaths:
						| keyof IdField<TableName>
						| ExtractFieldPaths<TableValidator>;
					indexes: Expand<Indexes & SystemIndexes>;
					searchIndexes: SearchIndexes;
					vectorIndexes: VectorIndexes;
				}
			: never
		: never;
};

type ExtractConfectDocument<
	TableName extends string,
	S extends Schema.Schema<any>,
> = Expand<
	ReadonlyDeep<IdField<TableName>> & ReadonlyDeep<SystemFields> & S["Type"]
>;

export const confectSystemSchema = defineConfectSchema({
	_scheduled_functions: defineConfectTable(
		Schema.Struct({
			name: Schema.String,
			args: Schema.Array(Schema.Any),
			scheduledTime: Schema.Number,
			completedTime: Schema.optional(Schema.Number, { exact: true }),
			state: Schema.Union(
				Schema.Struct({ kind: Schema.Literal("pending") }),
				Schema.Struct({ kind: Schema.Literal("inProgress") }),
				Schema.Struct({ kind: Schema.Literal("success") }),
				Schema.Struct({
					kind: Schema.Literal("failed"),
					error: Schema.String,
				}),
				Schema.Struct({ kind: Schema.Literal("canceled") }),
			),
		}),
	),
	_storage: defineConfectTable(
		Schema.Struct({
			sha256: Schema.String,
			size: Schema.Number,
			contentType: Schema.optional(Schema.String, { exact: true }),
		}),
	),
});

type ConfectSystemSchema = typeof confectSystemSchema;

export type ConfectSystemDataModel =
	ConfectDataModelFromConfectSchemaDefinition<ConfectSystemSchema>;

// TODO: Vendored types:

/**
 * Extract all of the index field paths within a {@link Validator}.
 *
 * This is used within {@link defineTable}.
 * @public
 */
type ExtractFieldPaths<T extends Validator<any, any, any>> =
	// Add in the system fields available in index definitions.
	// This should be everything except for `_id` because thats added to indexes
	// automatically.
	T["fieldPaths"] | keyof SystemFields;

/**
 * Extract the {@link GenericDocument} within a {@link Validator} and
 * add on the system fields.
 *
 * This is used within {@link defineTable}.
 * @public
 */
type ExtractDocument<
	TableName extends string,
	T extends Validator<any, any, any>,
> = Expand<IdField<TableName> & SystemFields & T["type"]>; //the table name) and trick TypeScript into expanding them. // Add the system fields to `Value` (except `_id` because it depends on
