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

// TODO: Need to produce proper type for Convex `SchemaDefinition` (`DatabaseSchema`)

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

export const defineEffectSchema = <
  DatabaseSchema extends GenericSchema,
  TypeScriptSchema extends GenericEffectSchema,
>(
  effectSchema: TypeScriptSchema
) =>
  new EffectSchemaDefinitionImpl<DatabaseSchema, TypeScriptSchema>(
    effectSchema
  );

export interface EffectTableDefinition<
  DatabaseDocument extends GenericDocument,
  TypeScriptDocument,
  FieldPaths extends GenericFieldPaths = string,
  Indexes extends GenericTableIndexes = Record<string, never>,
  SearchIndexes extends GenericTableSearchIndexes = Record<string, never>,
  VectorIndexes extends GenericTableVectorIndexes = Record<string, never>,
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
  TypeScriptDocument,
  FieldPaths extends GenericFieldPaths = string,
  Indexes extends GenericTableIndexes = Record<string, never>,
  SearchIndexes extends GenericTableSearchIndexes = Record<string, never>,
  VectorIndexes extends GenericTableVectorIndexes = Record<string, never>,
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
  TypeScriptValue,
>(
  schema: Schema.Schema<DatabaseDocument, TypeScriptValue>
): EffectTableDefinition<DatabaseDocument, TypeScriptValue> =>
  new EffectTableDefinitionImpl(schema);

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
