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
import { pipe, Record, Schema } from "effect";
import type { GenericConfectDataModel } from "./data_model";
import {
  compileTableSchema,
  type TableSchemaToTableValidator,
} from "./schema_to_validator";
import {
  type ExtendWithSystemFields,
  extendWithSystemFields,
} from "./schemas/SystemFields";

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
    ...Record.map(confectSystemTableSchemas, (tableSchema, tableName) => ({
      withSystemFields: extendWithSystemFields(tableName, tableSchema),
      withoutSystemFields: tableSchema,
    })),
  }) as any;

/**
 * A Confect schema is a record of table definitions.
 */
export type GenericConfectSchema = Record<
  string,
  GenericConfectTableDefinition
>;

/**
 * A Confect schema definition tracks the Confect schema, its Convex schema definition, and all of its table schemas.
 */
export type GenericConfectSchemaDefinition =
  ConfectSchemaDefinition<GenericConfectSchema>;

export interface ConfectSchemaDefinition<
  ConfectSchema extends GenericConfectSchema,
> {
  confectSchema: ConfectSchema;
  convexSchemaDefinition: SchemaDefinition<
    SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
    true
  >;
  // TODO: Key everything on table schema names? Or else address the fact that Confect schemas are accessible from both `confectSchema` and `tableSchemas`, which seems like an opportunity to unite them somehow.
  tableSchemas: TableSchemasFromConfectSchema<ConfectSchema>;
}

class ConfectSchemaDefinitionImpl<ConfectSchema extends GenericConfectSchema>
  implements ConfectSchemaDefinition<ConfectSchema>
{
  confectSchema: ConfectSchema;
  convexSchemaDefinition: SchemaDefinition<
    SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
    true
  >;
  tableSchemas: TableSchemasFromConfectSchema<ConfectSchema>;

  constructor(confectSchema: ConfectSchema) {
    this.confectSchema = confectSchema;
    this.convexSchemaDefinition = pipe(
      confectSchema,
      Record.map(({ tableDefinition }) => tableDefinition),
      defineConvexSchema,
    ) as SchemaDefinition<
      SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
      true
    >;
    this.tableSchemas = tableSchemasFromConfectSchema(confectSchema);
  }
}

type SchemaDefinitionFromConfectSchemaDefinition<
  ConfectSchema extends GenericConfectSchema,
> = Expand<{
  [TableName in keyof ConfectSchema &
    string]: ConfectSchema[TableName]["tableDefinition"];
}>;

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

class ConfectTableDefinitionImpl<
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

  tableSchema: TableSchema;
  indexes: Indexes;

  constructor(
    tableSchema: TableSchema,
    tableValidator: TableValidator,
    indexes: Indexes = {} as Indexes,
  ) {
    this.tableDefinition = defineConvexTable(tableValidator);

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

/**
 * Define a Confect table.
 */
export const defineConfectTable = <
  TableSchema extends Schema.Schema.AnyNoContext,
>(
  tableSchema: TableSchema,
): ConfectTableDefinition<TableSchema> => {
  const tableValidator = compileTableSchema(tableSchema);
  return new ConfectTableDefinitionImpl(
    tableSchema,
    tableValidator,
  ) as ConfectTableDefinition<TableSchema>;
};

export type TableNamesInConfectSchema<
  ConfectSchema extends GenericConfectSchema,
> = keyof ConfectSchema & string;

export type TableNamesInConfectSchemaDefinition<
  ConfectSchemaDefinition extends GenericConfectSchemaDefinition,
> = TableNamesInConfectSchema<ConfectSchemaDefinition["confectSchema"]>;

/**
 * Produce a Confect data model from a Confect schema.
 */
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
    ? TableSchema extends Schema.Schema.AnyNoContext
      ? {
          // TODO: Rename this to `confectDocumentType` and rename `encodedConfectDocument` to `confectDocumentEncoded`, for better symmetry.
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

export const confectSystemSchema = {
  _scheduled_functions: defineConfectTable(
    confectSystemTableSchemas._scheduled_functions,
  ),
  _storage: defineConfectTable(confectSystemTableSchemas._storage),
};

export type ConfectSystemSchema = typeof confectSystemSchema;

export const confectSystemSchemaDefinition =
  defineConfectSchema(confectSystemSchema);

type ConfectSystemSchemaDefinition = typeof confectSystemSchemaDefinition;

export type ConfectSystemDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSystemSchemaDefinition>;

export const extendWithConfectSystemSchema = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchema: ConfectSchema,
): ExtendWithConfectSystemSchema<ConfectSchema> =>
  ({ ...confectSchema, ...confectSystemSchema }) as any;

export type ExtendWithConfectSystemSchema<
  ConfectSchema extends GenericConfectSchema,
> = Expand<ConfectSchema & ConfectSystemSchema>;

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
      [TableName in keyof ConfectSystemSchemaDefinition["confectSchema"]]: {
        withSystemFields: ExtendWithSystemFields<
          TableName,
          ConfectSystemSchemaDefinition["confectSchema"][TableName]["tableSchema"]
        >;
        withoutSystemFields: ConfectSystemSchemaDefinition["confectSchema"][TableName]["tableSchema"];
      };
    }
  >;

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
> = Expand<IdField<TableName> & SystemFields & T["type"]>; //the table name) and trick TypeScript into expanding them. // Add the system fields to `Value` (except `_id` because it depends on
