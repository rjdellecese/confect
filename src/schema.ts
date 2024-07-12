import * as Schema from "@effect/schema/Schema";
import {
  defineSchema,
  defineTable,
  Expand,
  GenericSchema,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IdField,
  IndexTiebreakerField,
  SchemaDefinition,
  SearchIndexConfig,
  SystemFields,
  SystemIndexes,
  TableDefinition,
  VectorIndexConfig,
} from "convex/server";
import { Validator } from "convex/values";
import { pipe, Record } from "effect";
import { ReadonlyDeep } from "type-fest";

import { compileTableSchema } from "~/src/schema-to-validator-compiler";

export type GenericConfectSchema = Record<
  string,
  ConfectTableDefinition<any, any, any, any, any>
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
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
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
> =
  ConfectSchemaDef extends ConfectSchemaDefinition<
    infer _ConvexSchema,
    infer ConfectSchema
  >
    ? ConfectSchema
    : never;

class ConfectTableDefinitionImpl<
  TableSchema extends Schema.Schema<any, any>,
  TableValidator extends Validator<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
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

// TODO: Type-level test that `ConfectDataModelFromEffectSchema` produces `ConfectDataModel`?

// TODO: Add system tables (see https://github.com/get-convex/convex-js/blob/432247e28d67a36b165c0beea2c3b2629d7f87ee/src/server/schema.ts#L574-L598)

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
> =
  // Add the system fields to `Value` (except `_id` because it depends on
  //the table name) and trick TypeScript into expanding them.
  Expand<IdField<TableName> & SystemFields & T["type"]>;
