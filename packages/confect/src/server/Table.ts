import {
  defineTable,
  type SystemFields as ConvexSystemFields,
  type Expand,
  type GenericTableIndexes,
  type GenericTableSearchIndexes,
  type GenericTableVectorIndexes,
  type IndexTiebreakerField,
  type SearchIndexConfig,
  type TableDefinition,
  type VectorIndexConfig,
} from "convex/server";
import type { GenericValidator, Validator } from "convex/values";
import { Predicate, Schema } from "effect";
import * as SystemFields from "../api/SystemFields";
import {
  compileTableSchema,
  type TableSchemaToTableValidator,
} from "./SchemaToValidator";

export const TypeId = "@rjdellecese/confect/server/Table";
export type TypeId = typeof TypeId;

export const isTable = (u: unknown): u is Table.Any =>
  Predicate.hasProperty(u, TypeId);

export interface Table<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
  TableValidator extends
    GenericValidator = TableSchemaToTableValidator<TableSchema>,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> {
  readonly [TypeId]: TypeId;
  readonly tableDefinition: TableDefinition<
    TableValidator,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;

  readonly name: TableName;

  readonly Fields: TableSchema;
  readonly Doc: SystemFields.ExtendWithSystemFields<TableName, TableSchema>;

  readonly indexes: Indexes;

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<TableValidator>,
    RestFieldPaths extends ExtractFieldPaths<TableValidator>[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ): Table<
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
  ): Table<
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
  ): Table<
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

export declare namespace Table {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export type AnyWithProps = Table<
    any,
    Schema.Schema.AnyNoContext,
    GenericValidator,
    GenericTableIndexes,
    GenericTableSearchIndexes,
    GenericTableVectorIndexes
  >;

  export type Name<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableName & string
      : never;

  export type TableSchema<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer _TableName,
      infer TableSchema_,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableSchema_
      : never;

  export type TableValidator<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer _TableName,
      infer _TableSchema,
      infer TableValidator_,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableValidator_
      : never;

  export type Indexes<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer _TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer Indexes_,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? Indexes_
      : never;

  export type SearchIndexes<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer _TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer SearchIndexes_,
      infer _VectorIndexes
    >
      ? SearchIndexes_
      : never;

  export type VectorIndexes<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer _TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer VectorIndexes_
    >
      ? VectorIndexes_
      : never;

  export type Doc<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer TableName,
      infer TableSchema_,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? SystemFields.ExtendWithSystemFields<TableName, TableSchema_>
      : never;

  export type Fields<TableDef extends AnyWithProps> =
    TableDef extends Table<
      infer _TableName,
      infer TableSchema_,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableSchema_
      : never;

  export type WithName<
    TableDef extends AnyWithProps,
    Name_ extends string,
  > = TableDef extends { readonly name: Name_ } ? TableDef : never;

  export type TablesRecord<Tables extends AnyWithProps> = {
    readonly [TableName_ in Name<Tables>]: WithName<Tables, TableName_>;
  };
}

const Proto = {
  [TypeId]: TypeId,

  index<
    IndexName extends string,
    FirstFieldPath extends string,
    RestFieldPaths extends string[],
  >(
    this: Table.AnyWithProps,
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ) {
    return makeProto({
      name: this.name,
      Fields: this.Fields,
      Doc: this.Doc,
      tableDefinition: this.tableDefinition.index(name, fields as any),
      indexes: {
        ...this.indexes,
        [name]: fields,
      },
    });
  },

  searchIndex<IndexName extends string, SearchField extends string>(
    this: Table.AnyWithProps,
    name: IndexName,
    indexConfig: SearchIndexConfig<SearchField, any>,
  ) {
    return makeProto({
      name: this.name,
      Fields: this.Fields,
      Doc: this.Doc,
      tableDefinition: this.tableDefinition.searchIndex(name, indexConfig),
      indexes: this.indexes,
    });
  },

  vectorIndex<IndexName extends string, VectorField extends string>(
    this: Table.AnyWithProps,
    name: IndexName,
    indexConfig: {
      vectorField: VectorField;
      dimensions: number;
      filterFields?: string[] | undefined;
    },
  ) {
    return makeProto({
      name: this.name,
      Fields: this.Fields,
      Doc: this.Doc,
      tableDefinition: this.tableDefinition.vectorIndex(name, {
        vectorField: indexConfig.vectorField,
        dimensions: indexConfig.dimensions,
        ...(indexConfig.filterFields
          ? { filterFields: indexConfig.filterFields }
          : {}),
      }),
      indexes: this.indexes,
    });
  },
};

const makeProto = <
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
  TableValidator extends Validator<any, any, any>,
  Indexes extends GenericTableIndexes,
  SearchIndexes extends GenericTableSearchIndexes,
  VectorIndexes extends GenericTableVectorIndexes,
>({
  name,
  Fields,
  Doc,
  tableDefinition,
  indexes,
}: {
  name: TableName;
  Fields: TableSchema;
  Doc: SystemFields.ExtendWithSystemFields<TableName, TableSchema>;
  tableDefinition: TableDefinition<
    TableValidator,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  indexes: Indexes;
}): Table<
  TableName,
  TableSchema,
  TableValidator,
  Indexes,
  SearchIndexes,
  VectorIndexes
> =>
  Object.assign(Object.create(Proto), {
    name,
    Fields,
    Doc,
    tableDefinition,
    indexes,
  });

/**
 * Create a table.
 */
export const make = <
  const TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
>(
  name: TableName,
  fields: TableSchema,
): Table<TableName, TableSchema> => {
  const tableValidator = compileTableSchema(fields);
  const tableDefinition = defineTable(tableValidator);

  return makeProto({
    name,
    Fields: fields,
    Doc: SystemFields.extendWithSystemFields(name, fields),
    tableDefinition,
    indexes: {},
  });
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

export const scheduledFunctionsTable = make(
  "_scheduled_functions",
  Schema.Struct({
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
);

export const storageTable = make(
  "_storage",
  Schema.Struct({
    sha256: Schema.String,
    size: Schema.Number,
    contentType: Schema.optionalWith(Schema.String, { exact: true }),
  }),
);

export const systemTables = {
  _scheduled_functions: scheduledFunctionsTable,
  _storage: storageTable,
} as const;

export type SystemTables = typeof scheduledFunctionsTable | typeof storageTable;

// Vendored types from convex-js, partially modified. Ideally we could use these directly. See https://github.com/get-convex/convex-js/pull/14

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
  T["fieldPaths"] | keyof ConvexSystemFields;
