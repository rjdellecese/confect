import type { GenericSchema } from "convex/server";
import {
  defineSchema as defineConvexSchema,
  defineTable as defineConvexTable,
  type Expand,
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
} from "convex/server";
import type { GenericValidator, Validator } from "convex/values";
import { Array, pipe, Predicate, Record, Schema } from "effect";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "./ConfectDataModel";
import {
  compileTableSchema,
  type TableSchemaToTableValidator,
} from "./SchemaToValidator";

export const confectSystemTableSchemas = {
  _scheduled_functions: Schema.Struct({
    name: Schema.String,
    args: Schema.Array(Schema.Any),
    scheduledTime: Schema.Number,
    completedTime: Schema.optional(Schema.Number),
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
    contentType: Schema.optional(Schema.String),
  }),
};

/**
 * A Confect schema is an array of table definitions.
 */
export type GenericConfectSchema = GenericConfectTableDefinition[];

/**
 * A Confect schema definition tracks the Confect schema and its Convex schema definition.
 */
export type GenericConfectSchemaDefinition =
  ConfectSchemaDefinition<GenericConfectSchema>;

export interface ConfectSchemaDefinition<
  ConfectSchema extends GenericConfectSchema,
> {
  confectSchema: ConfectSchema;
  convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
}

export const TypeId = Symbol.for(
  "@rjdellecese/confect/ConfectSchemaDefinition",
);
export type TypeId = typeof TypeId;

export const isConfectSchemaDefinition = (
  u: unknown,
): u is GenericConfectSchemaDefinition => Predicate.hasProperty(u, TypeId);

class ConfectSchemaDefinitionImpl<ConfectSchema extends GenericConfectSchema>
  implements ConfectSchemaDefinition<ConfectSchema>
{
  readonly [TypeId]: TypeId = TypeId;
  confectSchema: ConfectSchema;
  convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;

  constructor(confectSchema: ConfectSchema) {
    this.confectSchema = confectSchema;
    this.convexSchemaDefinition = pipe(
      confectSchema,
      Array.map(
        ({ tableName, tableDefinition }) =>
          [tableName, tableDefinition] as const,
      ),
      Record.fromEntries,
      defineConvexSchema,
    );
  }
}

/**
 * Define a Confect schema.
 */
export const defineConfectSchema = <ConfectSchema extends GenericConfectSchema>(
  confectSchema: ConfectSchema,
): ConfectSchemaDefinition<ConfectSchema> =>
  new ConfectSchemaDefinitionImpl<ConfectSchema>(confectSchema);

export type GenericConfectTableDefinition = ConfectTableDefinition<
  any,
  any,
  any,
  any,
  any
>;

export interface ConfectTableDefinition<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
  TableValidator extends
    GenericValidator = TableSchemaToTableValidator<TableSchema>,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> {
  tableDefinition: TableDefinition<
    TableValidator,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;

  tableName: TableName;
  tableSchema: TableSchema;
  indexes: Indexes;

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<TableValidator>,
    RestFieldPaths extends ExtractFieldPaths<TableValidator>[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ): ConfectTableDefinition<
    TableName,
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
    TableName,
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
    TableName,
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
  ConfectSchemaDef extends ConfectSchemaDefinition<infer ConfectSchema>
    ? ConfectSchema
    : never;

/**
 * @ignore
 */
export type ConfectDataModelFromConfectSchemaDefinition<
  ConfectSchemaDef extends GenericConfectSchemaDefinition,
> =
  ConfectSchemaDef extends ConfectSchemaDefinition<infer ConfectSchema>
    ? ConfectDataModelFromConfectSchema<ConfectSchema>
    : never;

export type DataModelFromConfectSchemaDefinition<
  ConfectSchemaDef extends GenericConfectSchemaDefinition,
> = DataModelFromConfectDataModel<
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDef>
>;

export type DataModelFromConfectSchema<
  ConfectSchema extends GenericConfectSchema,
> = DataModelFromConfectDataModel<
  ConfectDataModelFromConfectSchema<ConfectSchema>
>;

export type ConfectTableDefinitionFromConfectSchema<
  ConfectSchema extends GenericConfectSchema,
  TableName extends TableNamesInConfectSchema<ConfectSchema>,
> = Extract<ConfectSchema[number], { tableName: TableName }>;

class ConfectTableDefinitionImpl<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
  TableValidator extends Validator<
    any,
    any,
    any
  > = TableSchemaToTableValidator<TableSchema>,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> implements
    ConfectTableDefinition<
      TableName,
      TableSchema,
      TableValidator,
      Indexes,
      SearchIndexes,
      VectorIndexes
    >
{
  tableDefinition: TableDefinition<
    TableValidator,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;

  tableName: TableName;
  tableSchema: TableSchema;
  indexes: Indexes;

  constructor(
    tableName: TableName,
    tableSchema: TableSchema,
    tableValidator: TableValidator,
    indexes: Indexes = {} as Indexes,
  ) {
    this.tableDefinition = defineConvexTable(tableValidator);

    this.tableName = tableName;
    this.tableSchema = tableSchema;
    this.indexes = indexes;
  }

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<TableValidator>,
    RestFieldPaths extends ExtractFieldPaths<TableValidator>[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ): ConfectTableDefinition<
    TableName,
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
    this.indexes = {
      ...this.indexes,
      [name]: fields,
    };

    return this as any;
  }

  searchIndex<
    IndexName extends string,
    SearchField extends ExtractFieldPaths<TableValidator>,
    FilterFields extends ExtractFieldPaths<TableValidator> = never,
  >(
    name: IndexName,
    indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>,
  ): ConfectTableDefinition<
    TableName,
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
    TableName,
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

/**
 * Define a Confect table.
 */
export const defineConfectTable = <
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
>({
  name,
  fields,
}: {
  name: TableName;
  fields: TableSchema;
}): ConfectTableDefinition<TableName, TableSchema> => {
  const tableValidator = compileTableSchema(fields);
  return new ConfectTableDefinitionImpl(
    name,
    fields,
    tableValidator,
  ) as ConfectTableDefinition<TableName, TableSchema>;
};

export type TableNamesInConfectSchema<
  ConfectSchema extends GenericConfectSchema,
> =
  ConfectSchema[number] extends ConfectTableDefinition<
    infer TableName,
    any,
    any,
    any,
    any,
    any
  >
    ? TableName
    : never;

export type TableNamesInConfectSchemaDefinition<
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
> = TableNamesInConfectSchema<ConfectSchemaDefinition["confectSchema"]>;

/**
 * Produce a Confect data model from a Confect schema.
 */
export type ConfectDataModelFromConfectSchema<
  ConfectSchema extends GenericConfectSchema,
> = {
  [K in ConfectSchema[number] as K extends ConfectTableDefinition<
    infer TableName,
    any,
    any,
    any,
    any,
    any
  >
    ? TableName
    : never]: K extends ConfectTableDefinition<
    infer TableName,
    infer TableSchema,
    infer TableValidator,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes
  >
    ? TableSchema extends Schema.Schema.AnyNoContext
      ? {
          // It's pretty hard to recursively make an arbitrary TS type readonly/mutable, so we capture both the readonly version of the `convexDocument` (which is the `encodedConfectDocument`) and the mutable version (`convexDocument`).
          confectDocument: ExtractConfectDocument<TableName, TableSchema>;
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
  TableSchema extends Schema.Schema.AnyNoContext,
> = Expand<
  Readonly<IdField<TableName>> & Readonly<SystemFields> & TableSchema["Type"]
>;

type ExtractEncodedConfectDocument<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = Expand<
  Readonly<IdField<TableName>> & Readonly<SystemFields> & TableSchema["Encoded"]
>;

export const confectSystemTableDefinitions = [
  defineConfectTable({
    name: "_scheduled_functions",
    fields: confectSystemTableSchemas._scheduled_functions,
  }),
  defineConfectTable({
    name: "_storage",
    fields: confectSystemTableSchemas._storage,
  }),
];

export type ConfectSystemSchema = typeof confectSystemTableDefinitions;

export const confectSystemSchemaDefinition = defineConfectSchema(
  confectSystemTableDefinitions,
);

type ConfectSystemSchemaDefinition = typeof confectSystemSchemaDefinition;

export type ConfectSystemDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSystemSchemaDefinition>;

export const extendWithConfectSystemSchema = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchema: ConfectSchema,
): ExtendWithConfectSystemSchema<ConfectSchema> =>
  [...confectSchema, ...confectSystemTableDefinitions] as any;

export type ExtendWithConfectSystemSchema<
  ConfectSchema extends GenericConfectSchema,
> = [...ConfectSchema, ...ConfectSystemSchema];

export type TableSchemasFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel & string]: Schema.Schema<
    ConfectDataModel[TableName]["confectDocument"],
    ConfectDataModel[TableName]["encodedConfectDocument"]
  >;
};

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
> = Expand<IdField<TableName> & SystemFields & T["type"]>;
