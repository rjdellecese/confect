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
	defineSchema as defineConvexSchema,
	defineTable as defineConvexTable,
} from "convex/server";
import type { Validator } from "convex/values";
import { Record, Schema, pipe } from "effect";

import { compileTableSchema } from "~/src/server/schema-to-validator";
import {
	type ExtendWithSystemFields,
	extendWithSystemFields,
} from "~/src/server/schemas/SystemFields";

export const confectTableSchemas = {
	_scheduled_functions: Schema.Struct({
		name: Schema.String,
		args: Schema.Array(Schema.Any),
		scheduledTime: Schema.Number,
		completedTime: Schema.optionalWith(Schema.Number, { exact: true }),
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
	_storage: Schema.Struct({
		sha256: Schema.String,
		size: Schema.Number,
		contentType: Schema.optionalWith(Schema.String, { exact: true }),
	}),
};

const tableSchemasFromConfectSchema = <
	ConfectSchema extends GenericConfectSchema,
>(
	confectSchema: ConfectSchema,
): TableSchemasFromConfectSchema<ConfectSchema> =>
	({
		...Record.map(confectSchema, ({ tableSchema }, tableName) => ({
			withSystemFields: extendWithSystemFields(tableName, tableSchema),
			withoutSystemFields: tableSchema,
		})),
		...Record.map(confectTableSchemas, (tableSchema, tableName) => ({
			withSystemFields: extendWithSystemFields(tableName, tableSchema),
			withoutSystemFields: tableSchema,
		})),
	}) as any;

export type GenericConfectSchema = Record<any, GenericConfectTableDefinition>;

export type GenericConfectSchemaDefinition = ConfectSchemaDefinition<
	GenericSchema,
	GenericConfectSchema
>;

export interface ConfectSchemaDefinition<
	ConvexSchema extends GenericSchema,
	ConfectSchema extends GenericConfectSchema,
> {
	confectSchema: ConfectSchema;
	convexSchemaDefinition: SchemaDefinition<ConvexSchema, true>;
	tableSchemas: TableSchemasFromConfectSchema<ConfectSchema>;
}

class ConfectSchemaDefinitionImpl<
	ConvexSchema extends GenericSchema,
	ConfectSchema extends GenericConfectSchema,
> implements ConfectSchemaDefinition<ConvexSchema, ConfectSchema>
{
	confectSchema: ConfectSchema;
	convexSchemaDefinition: SchemaDefinition<ConvexSchema, true>;
	tableSchemas: TableSchemasFromConfectSchema<ConfectSchema>;

	constructor(confectSchema: ConfectSchema) {
		this.confectSchema = confectSchema;
		this.convexSchemaDefinition = pipe(
			confectSchema,
			Record.map(({ tableDefinition }) => tableDefinition),
			defineConvexSchema,
		) as SchemaDefinition<ConvexSchema, true>;
		this.tableSchemas = tableSchemasFromConfectSchema(confectSchema);
	}
}

type SchemaDefinitionFromConfectSchemaDefinition<
	ConfectSchema extends GenericConfectSchema,
> = Expand<{
	[TableName in keyof ConfectSchema &
		string]: ConfectSchema[TableName]["tableDefinition"];
}>;

export const defineSchema = <ConfectSchema extends GenericConfectSchema>(
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
	TableSchema extends Schema.Schema.AnyNoContext,
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
	TableSchema extends Schema.Schema.AnyNoContext,
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
		this.tableDefinition = defineConvexTable(tableValidator);
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

export const defineTable = <TableSchema extends Schema.Schema.AnyNoContext>(
	tableSchema: TableSchema,
) => {
	const tableValidator = compileTableSchema(tableSchema);
	return new ConfectTableDefinitionImpl(tableSchema, tableValidator);
};

export type TableNamesInConfectSchema<
	ConfectSchema extends GenericConfectSchema,
> = keyof ConfectSchema & string;

export type TableNamesInConfectSchemaDefinition<
	ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
> = TableNamesInConfectSchema<ConfectSchemaDefinition["confectSchema"]>;

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
					// It's pretty hard to recursively make an arbitrary TS type readonly/mutable, so we capture both the readonly version of the `convexDocument` (which is the `encodedConfectDocument`) and the mutable version (`convexDocument`).
					encodedConfectDocument: ExtractEncodedConfectDocument<
						TableName,
						TableSchema
					>;
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
	S extends Schema.Schema<any, any>,
> = Expand<Readonly<IdField<TableName>> & Readonly<SystemFields> & S["Type"]>;

type ExtractEncodedConfectDocument<
	TableName extends string,
	S extends Schema.Schema<any, any>,
> = Expand<
	Readonly<IdField<TableName>> & Readonly<SystemFields> & S["Encoded"]
>;

export const confectSystemSchema = {
	_scheduled_functions: defineTable(confectTableSchemas._scheduled_functions),
	_storage: defineTable(confectTableSchemas._storage),
};

export const confectSystemSchemaDefinition = defineSchema(confectSystemSchema);

type ConfectSystemSchema = typeof confectSystemSchemaDefinition;

export type ConfectSystemDataModel =
	ConfectDataModelFromConfectSchemaDefinition<ConfectSystemSchema>;

type TableSchemasFromConfectSchema<ConfectSchema extends GenericConfectSchema> =
	Expand<
		{
			[TableName in keyof ConfectSchema & string]: {
				withSystemFields: ExtendWithSystemFields<
					TableName,
					ConfectSchema[TableName]["tableSchema"]
				>;
				withoutSystemFields: ConfectSchema[TableName]["tableSchema"];
			};
		} & {
			[TableName in keyof ConfectSystemSchema["confectSchema"]]: {
				withSystemFields: ExtendWithSystemFields<
					TableName,
					ConfectSystemSchema["confectSchema"][TableName]["tableSchema"]
				>;
				withoutSystemFields: ConfectSystemSchema["confectSchema"][TableName]["tableSchema"];
			};
		}
	>;

// Vendored types from convex-js, partially modified. Ideally we could use these directly. See https://github.com/get-convex/convex-js/pull/14

/**
 * Extract all of the index field paths within a {@link Validator}.
 *
 * This is used within {@link defineConvexTable}.
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
 * This is used within {@link defineConvexTable}.
 * @public
 */
type ExtractDocument<
	TableName extends string,
	T extends Validator<any, any, any>,
> = Expand<IdField<TableName> & SystemFields & T["type"]>; //the table name) and trick TypeScript into expanding them. // Add the system fields to `Value` (except `_id` because it depends on
