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
  SystemFields,
  SystemIndexes,
  TableDefinition,
  VectorIndexConfig,
} from "convex/server";
import { pipe, Record } from "effect";
import { ReadonlyDeep, WritableDeep } from "type-fest";

import {
  GenericConfectDocument,
  WithIdAndSystemFields,
} from "~/src/data-model";
import * as schemaToValidatorCompiler from "~/src/schema-to-validator-compiler";

export type GenericConfectSchema = Record<
  string,
  ConfectTableDefinition<any, any>
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
  [TableName in keyof ConfectSchema &
    string]: ConfectSchema[TableName]["tableDefinition"];
}>;

export const defineConfectSchema = <ConfectSchema extends GenericConfectSchema>(
  confectSchema: ConfectSchema
) =>
  new ConfectSchemaDefinitionImpl<
    SchemaDefinitionFromConfectSchemaDefinition<ConfectSchema>,
    ConfectSchema
  >(confectSchema);

export type GenericConfectTableDefinition = ConfectTableDefinition<
  any,
  any,
  any,
  any,
  any,
  any
>;

export interface ConfectTableDefinition<
  ConvexDocument extends GenericDocument,
  ConfectDocument extends GenericConfectDocument,
  FieldPaths extends GenericFieldPaths = string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Indexes extends GenericTableIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  SearchIndexes extends GenericTableSearchIndexes = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  VectorIndexes extends GenericTableVectorIndexes = {},
> {
  tableDefinition: TableDefinition<
    ConvexDocument,
    FieldPaths,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  schema: Schema.Schema<ConfectDocument, ConvexDocument>;

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
  ConvexDocument extends GenericDocument,
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
    Expand<ConvexDocument & SystemFields>,
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

// TODO: Convert the Schema to make all document mutable
// TODO: System fields (except ID) are also added by the Convex lib here
export const defineConfectTable = <
  ConvexDocument extends ReadonlyDeep<GenericDocument>,
  ConfectDocument extends GenericConfectDocument,
>(
  schema: Schema.Schema<ConfectDocument, ConvexDocument>
): ConfectTableDefinition<WritableDeep<ConvexDocument>, ConfectDocument> =>
  new ConfectTableDefinitionImpl(
    // TODO: Is there a safer way to do this? If not, write lots of tests.
    schema as unknown as Schema.Schema<
      ConfectDocument,
      WritableDeep<ConvexDocument>
    >
  );

export type TableNamesInConfectSchema<
  ConfectSchema extends GenericConfectSchema,
> = keyof ConfectSchema & string;

export type ConfectDataModelFromConfectSchema<
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
        document: WithIdAndSystemFields<Document, TableName>;
        confectDocument: WithIdAndSystemFields<ConfectDocument, TableName>;
        fieldPaths: keyof IdField<TableName> | FieldPaths;
        indexes: Expand<Indexes & SystemIndexes>;
        searchIndexes: SearchIndexes;
        vectorIndexes: VectorIndexes;
      }
    : never;
};

// TODO: Type-level test that `ConfectDataModelFromEffectSchema` produces `ConfectDataModel`?

// TODO: Add system tables (see https://github.com/get-convex/convex-js/blob/432247e28d67a36b165c0beea2c3b2629d7f87ee/src/server/schema.ts#L574-L598)
