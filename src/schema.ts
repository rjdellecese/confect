import * as Schema from "@effect/schema/Schema";
import {
  defineTable,
  GenericDocument,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  SearchIndexConfig,
  TableDefinition,
} from "convex/server";

import schemaToValidatorCompiler from "./schema-to-validator-compiler";

export type EffectSchemaDefinition = {};

export interface EffectTableDefinition<
  DatabaseDocument extends GenericDocument,
  TypeScriptDocument,
  FieldPaths extends string = string,
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
    // Update `Indexes` to include the new index and use `Expand` to make the
    // types look pretty in editors.
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
    // Update `SearchIndexes` to include the new index and use `Expand` to make
    // the types look pretty in editors.
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
    // Update `VectorIndexes` to include the new index and use `Expand` to make
    // the types look pretty in editors.
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

class EffectTableDefinitionImpl<
  DatabaseDocument extends GenericDocument,
  TypeScriptDocument,
  FieldPaths extends string = string,
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
  private tableDefinition: TableDefinition<
    DatabaseDocument,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  private schema: Schema.Schema<DatabaseDocument, TypeScriptDocument>;

  constructor(schema: Schema.Schema<DatabaseDocument, TypeScriptDocument>) {
    this.schema = schema;
    // TODO: Need the proper compiler here
    this.tableDefinition = defineTable(schemaToValidatorCompiler.args(schema));
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

type Index = {
  indexDescriptor: string;
  fields: string[];
};

type SearchIndex = {
  indexDescriptor: string;
  searchField: string;
  filterFields: string[];
};

type VectorIndex = {
  indexDescriptor: string;
  vectorField: string;
  dimensions: number;
  filterFields: string[];
};
