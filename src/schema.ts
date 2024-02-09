import * as Schema from "@effect/schema/Schema";
import {
  defineSchema,
  defineTable,
  GenericDocument,
  GenericFieldPaths,
  GenericSchema,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  SchemaDefinition,
  SearchIndexConfig,
  TableDefinition,
} from "convex/server";
import { GenericId } from "convex/values";
import { pipe, ReadonlyRecord } from "effect";

import schemaToValidatorCompiler from "./schema-to-validator-compiler";

export type GenericEffectSchema = Record<
  string,
  EffectTableDefinition<any, any>
>;

export interface EffectSchemaDefinition<
  DatabaseSchema extends GenericSchema,
  TypeScriptSchema extends GenericEffectSchema,
> {
  effectSchema: TypeScriptSchema;
  schemaDefinition: SchemaDefinition<DatabaseSchema, true>;
}

class EffectSchemaDefinitionImpl<
  DatabaseSchema extends GenericSchema,
  TypeScriptSchema extends GenericEffectSchema,
> implements EffectSchemaDefinition<DatabaseSchema, TypeScriptSchema>
{
  effectSchema: TypeScriptSchema;
  schemaDefinition: SchemaDefinition<DatabaseSchema, true>;

  constructor(effectSchema: TypeScriptSchema) {
    this.effectSchema = effectSchema;
    this.schemaDefinition = pipe(
      effectSchema,
      ReadonlyRecord.map(({ tableDefinition }) => tableDefinition),
      defineSchema
    ) as SchemaDefinition<DatabaseSchema, true>;
  }
}

type SchemaDefinitionFromEffectSchemaDefinition<
  TypeScriptSchema extends GenericEffectSchema,
> = Expand<{
  [TableName in keyof TypeScriptSchema]: TypeScriptSchema[TableName]["tableDefinition"];
}>;

export const defineEffectSchema = <
  TypeScriptSchema extends GenericEffectSchema,
>(
  effectSchema: TypeScriptSchema
) =>
  new EffectSchemaDefinitionImpl<
    SchemaDefinitionFromEffectSchemaDefinition<TypeScriptSchema>,
    TypeScriptSchema
  >(effectSchema);

export interface EffectTableDefinition<
  DatabaseDocument extends GenericDocument,
  TypeScriptDocument extends GenericEffectDocument,
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
  ): EffectTableDefinition<
    DatabaseDocument,
    TypeScriptDocument,
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
  ): EffectTableDefinition<
    DatabaseDocument,
    TypeScriptDocument,
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
  ): EffectTableDefinition<
    DatabaseDocument,
    TypeScriptDocument,
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
    DatabaseDocument,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  schema: Schema.Schema<DatabaseDocument, TypeScriptDocument>;
}

class EffectTableDefinitionImpl<
  DatabaseDocument extends GenericDocument,
  TypeScriptDocument extends GenericEffectDocument,
  FieldPaths extends GenericFieldPaths = string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  VectorIndexes extends GenericTableVectorIndexes = {},
> implements
    EffectTableDefinition<
      DatabaseDocument,
      TypeScriptDocument,
      FieldPaths,
      Indexes,
      SearchIndexes,
      VectorIndexes
    >
{
  tableDefinition: TableDefinition<
    DatabaseDocument,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  schema: Schema.Schema<DatabaseDocument, TypeScriptDocument>;

  constructor(schema: Schema.Schema<DatabaseDocument, TypeScriptDocument>) {
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
  ): EffectTableDefinition<
    DatabaseDocument,
    TypeScriptDocument,
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
  ): EffectTableDefinition<
    DatabaseDocument,
    TypeScriptDocument,
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
  ): EffectTableDefinition<
    DatabaseDocument,
    TypeScriptDocument,
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

export const defineEffectTable = <
  DatabaseDocument extends GenericDocument,
  TypeScriptDocument extends GenericEffectDocument,
>(
  schema: Schema.Schema<DatabaseDocument, TypeScriptDocument>
): EffectTableDefinition<DatabaseDocument, TypeScriptDocument> =>
  new EffectTableDefinitionImpl(schema);

// TODO: Put in `data-model.ts` module, to mirror how Convex organizes things?

export type GenericEffectDocument = Record<string, any>;

export type GenericEffectTableInfo = {
  document: GenericDocument;
  effectDocument: GenericEffectDocument;
  fieldPaths: GenericFieldPaths;
  indexes: GenericTableIndexes;
  searchIndexes: GenericTableSearchIndexes;
  vectorIndexes: GenericTableVectorIndexes;
};

// TODO: Type-level test?
export type TableInfoFromEffectTableInfo<
  EffectTableInfo extends GenericEffectTableInfo,
> = {
  document: EffectTableInfo["document"];
  fieldPaths: EffectTableInfo["fieldPaths"];
  indexes: EffectTableInfo["indexes"];
  searchIndexes: EffectTableInfo["searchIndexes"];
  vectorIndexes: EffectTableInfo["vectorIndexes"];
};

export type GenericEffectDataModel = Record<string, GenericEffectTableInfo>;

// TODO: Type-level test?
export type DataModelFromEffectDataModel<
  EffectDataModel extends GenericEffectDataModel,
> = {
  [TableName in keyof EffectDataModel]: TableInfoFromEffectTableInfo<
    EffectDataModel[TableName]
  >;
};

export type TableNamesInEffectDataModel<
  EffectDataModel extends GenericEffectDataModel,
> = keyof EffectDataModel & string;

export type TableNamesInEffectSchema<EffectSchema extends GenericEffectSchema> =
  keyof EffectSchema & string;

export type EffectDataModelFromEffectSchema<
  EffectSchema extends GenericEffectSchema,
> = {
  [TableName in keyof EffectSchema &
    string]: EffectSchema[TableName] extends EffectTableDefinition<
    infer Document,
    infer EffectDocument,
    infer FieldPaths,
    infer Indexes,
    infer SearchIndexes,
    infer VectorIndexes
  >
    ? {
        // We've already added all of the system fields except for `_id`.
        // Add that here.
        document: Expand<IdField<TableName> & Document>;
        effectDocument: Expand<IdField<TableName> & EffectDocument>;
        fieldPaths: keyof IdField<TableName> | FieldPaths;
        indexes: Expand<Indexes & SystemIndexes>;
        searchIndexes: SearchIndexes;
        vectorIndexes: VectorIndexes;
      }
    : never;
};

// NOTE: Remove if/when exposed

type Expand<ObjectType extends Record<any, any>> = ObjectType extends Record<
  any,
  any
>
  ? {
      [Key in keyof ObjectType]: ObjectType[Key];
    }
  : never;

type IndexTiebreakerField = "_creationTime";

interface VectorIndexConfig<
  VectorField extends string,
  FilterFields extends string,
> {
  /**
   * The field to index for vector search.
   *
   * This must be a field of type `v.array(v.float64())` (or a union)
   */
  vectorField: VectorField;
  /**
   * The length of the vectors indexed. This must be between 2 and 2048 inclusive.
   */
  dimensions: number;
  /**
   * Additional fields to index for fast filtering when running vector searches.
   */
  filterFields?: FilterFields[];
}

export type IdField<TableName extends string> = {
  _id: GenericId<TableName>;
};

export type SystemIndexes = {
  // We have a system index `by_id` but developers should never have a use
  // for querying it (`db.get(id)` is always simpler).
  // by_id: ["_id"];

  by_creation_time: ["_creationTime"];
};