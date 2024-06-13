import * as Schema from "@effect/schema/Schema";
import {
  defineSchema,
  defineTable,
  Expand,
  GenericDocument,
  GenericFieldPaths,
  GenericSchema,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IdField,
  IndexTiebreakerField,
  SchemaDefinition,
  SearchIndexConfig,
  SystemIndexes,
  TableDefinition,
  VectorIndexConfig,
} from "convex/server";
import { pipe, Record } from "effect";
import { ReadonlyDeep, WritableDeep } from "type-fest";

import schemaToValidatorCompiler from "~/src/schema-to-validator-compiler";

export type GenericConfectSchema = Record<
  string,
  ConfectTableDefinition<any, any>
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

  constructor(effectSchema: ConfectSchema) {
    this.confectSchema = effectSchema;
    this.schemaDefinition = pipe(
      effectSchema,
      Record.map(({ tableDefinition }) => tableDefinition),
      defineSchema
    ) as SchemaDefinition<ConvexSchema, true>;
  }
}

type SchemaDefinitionFromConfectSchemaDefinition<
  ConfectSchema extends GenericConfectSchema,
> = Expand<{
  [TableName in keyof ConfectSchema]: ConfectSchema[TableName]["tableDefinition"];
}>;

export const defineConfectSchema = <ConfectSchema extends GenericConfectSchema>(
  confectSchema: ConfectSchema
) =>
  new ConfectSchemaDefinitionImpl<
    SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
    ConfectSchema
  >(confectSchema);

export interface ConfectTableDefinition<
  ConvexDocument extends ReadonlyDeep<GenericDocument>,
  ConfectDocument extends GenericConfectDocument,
  FieldPaths extends GenericFieldPaths = string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  VectorIndexes extends GenericTableVectorIndexes = {},
> {
  index<
    IndexName extends string,
    FirstFieldPath extends FieldPaths,
    RestFieldPaths extends FieldPaths[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths]
  ): ConfectTableDefinition<
    ConvexDocument,
    ConfectDocument,
    FieldPaths,
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
    SearchField extends FieldPaths,
    FilterFields extends FieldPaths = never,
  >(
    name: IndexName,
    indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>
  ): ConfectTableDefinition<
    ConvexDocument,
    ConfectDocument,
    FieldPaths,
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
    VectorField extends FieldPaths,
    FilterFields extends FieldPaths = never,
  >(
    name: IndexName,
    indexConfig: Expand<VectorIndexConfig<VectorField, FilterFields>>
  ): ConfectTableDefinition<
    ConvexDocument,
    ConfectDocument,
    FieldPaths,
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
  tableDefinition: TableDefinition<
    WritableDeep<ConvexDocument>,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  schema: Schema.Schema<ConfectDocument, ConvexDocument>;
}

class ConfectTableDefinitionImpl<
  ConvexDocument extends ReadonlyDeep<GenericDocument>,
  ConfectDocument extends GenericConfectDocument,
  FieldPaths extends GenericFieldPaths = string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  VectorIndexes extends GenericTableVectorIndexes = {},
> implements
    ConfectTableDefinition<
      ConvexDocument,
      ConfectDocument,
      FieldPaths,
      Indexes,
      SearchIndexes,
      VectorIndexes
    >
{
  tableDefinition: TableDefinition<
    WritableDeep<ConvexDocument>,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  schema: Schema.Schema<ConfectDocument, ConvexDocument>;

  constructor(schema: Schema.Schema<ConfectDocument, ConvexDocument>) {
    this.schema = schema;
    this.tableDefinition = defineTable(schemaToValidatorCompiler.table(schema));
  }

  index<
    IndexName extends string,
    FirstFieldPath extends FieldPaths,
    RestFieldPaths extends FieldPaths[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths]
  ): ConfectTableDefinition<
    ConvexDocument,
    ConfectDocument,
    FieldPaths,
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
    SearchField extends FieldPaths,
    FilterFields extends FieldPaths = never,
  >(
    name: IndexName,
    indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>
  ): ConfectTableDefinition<
    ConvexDocument,
    ConfectDocument,
    FieldPaths,
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
    VectorField extends FieldPaths,
    FilterFields extends FieldPaths = never,
  >(
    name: IndexName,
    indexConfig: {
      vectorField: VectorField;
      dimensions: number;
      filterFields?: FilterFields[] | undefined;
    }
  ): ConfectTableDefinition<
    ConvexDocument,
    ConfectDocument,
    FieldPaths,
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

export const defineConfectTable = <
  ConvexDocument extends ReadonlyDeep<GenericDocument>,
  ConfectDocument extends GenericConfectDocument,
>(
  schema: Schema.Schema<ConfectDocument, ConvexDocument>
): ConfectTableDefinition<ConvexDocument, ConfectDocument> =>
  new ConfectTableDefinitionImpl(schema);

// TODO: Put in `data-model.ts` module, to mirror how Convex organizes things?

export type GenericConfectDocument = Record<string, any>;

export type GenericConfectTableInfo = {
  document: GenericDocument;
  confectDocument: GenericConfectDocument;
  fieldPaths: GenericFieldPaths;
  indexes: GenericTableIndexes;
  searchIndexes: GenericTableSearchIndexes;
  vectorIndexes: GenericTableVectorIndexes;
};

// TODO: Type-level test?
export type TableInfoFromConfectTableInfo<
  ConfectTableInfo extends GenericConfectTableInfo,
> = {
  document: ConfectTableInfo["document"];
  fieldPaths: ConfectTableInfo["fieldPaths"];
  indexes: ConfectTableInfo["indexes"];
  searchIndexes: ConfectTableInfo["searchIndexes"];
  vectorIndexes: ConfectTableInfo["vectorIndexes"];
};

export type GenericConfectDataModel = Record<string, GenericConfectTableInfo>;

// TODO: Type-level test?
export type DataModelFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel]: TableInfoFromConfectTableInfo<
    ConfectDataModel[TableName]
  >;
};

export type TableNamesInConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = keyof ConfectDataModel & string;

export type TableNamesInConfectSchema<
  ConfectSchema extends GenericConfectSchema,
> = keyof ConfectSchema & string;

export type ConfectDataModelFromEffectSchema<
  ConfectSchema extends GenericConfectSchema,
> = {
  [TableName in keyof ConfectSchema &
    string]: ConfectSchema[TableName] extends ConfectTableDefinition<
    infer Document,
    infer ConfectDocument,
    infer FieldPaths,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes
  >
    ? {
        // We've already added all of the system fields except for `_id`.
        // Add that here.
        document: Expand<IdField<TableName> & WritableDeep<Document>>;
        confectDocument: Expand<IdField<TableName> & ConfectDocument>;
        fieldPaths: keyof IdField<TableName> | FieldPaths;
        indexes: Expand<Indexes & SystemIndexes>;
        searchIndexes: SearchIndexes;
        vectorIndexes: VectorIndexes;
      }
    : never;
};
