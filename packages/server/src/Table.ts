import * as SystemFields from "@confect/core/SystemFields";
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
import {
  compileTableSchema,
  type TableSchemaToTableValidator,
} from "./SchemaToValidator";

export const TypeId = "@confect/server/Table";
export type TypeId = typeof TypeId;

export const isTable = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId);

export interface Table<
  Name_ extends string,
  TableSchema_ extends Schema.Schema.AnyNoContext,
  // TODO: Something is going wrong here
  TableValidator_ extends
    GenericValidator = TableSchemaToTableValidator<TableSchema_>,
  Indexes_ extends GenericTableIndexes = {},
  SearchIndexes_ extends GenericTableSearchIndexes = {},
  VectorIndexes_ extends GenericTableVectorIndexes = {},
> {
  readonly [TypeId]: TypeId;
  readonly tableDefinition: TableDefinition<
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;

  readonly name: Name_;

  readonly Fields: TableSchema_;
  readonly Doc: SystemFields.ExtendWithSystemFields<Name_, TableSchema_>;

  readonly indexes: Indexes_;

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<TableValidator_>,
    RestFieldPaths extends ExtractFieldPaths<TableValidator_>[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ): Table<
    Name_,
    TableSchema_,
    TableValidator_,
    Expand<
      Indexes_ &
        Record<
          IndexName,
          [FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]
        >
    >,
    SearchIndexes_,
    VectorIndexes_
  >;

  searchIndex<
    IndexName extends string,
    SearchField extends ExtractFieldPaths<TableValidator_>,
    FilterFields extends ExtractFieldPaths<TableValidator_> = never,
  >(
    name: IndexName,
    indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>,
  ): Table<
    Name_,
    TableSchema_,
    TableValidator_,
    Indexes_,
    Expand<
      SearchIndexes_ &
        Record<
          IndexName,
          {
            searchField: SearchField;
            filterFields: FilterFields;
          }
        >
    >,
    VectorIndexes_
  >;

  vectorIndex<
    IndexName extends string,
    VectorField extends ExtractFieldPaths<TableValidator_>,
    FilterFields extends ExtractFieldPaths<TableValidator_> = never,
  >(
    name: IndexName,
    indexConfig: Expand<VectorIndexConfig<VectorField, FilterFields>>,
  ): Table<
    Name_,
    TableSchema_,
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    Expand<
      VectorIndexes_ &
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

const Proto = {
  [TypeId]: TypeId,

  index<
    IndexName extends string,
    FirstFieldPath extends string,
    RestFieldPaths extends string[],
  >(
    this: AnyWithProps,
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
    this: AnyWithProps,
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
    this: AnyWithProps,
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
  Name_ extends string,
  TableSchema_ extends Schema.Schema.AnyNoContext,
  TableValidator_ extends Validator<any, any, any>,
  Indexes_ extends GenericTableIndexes,
  SearchIndexes_ extends GenericTableSearchIndexes,
  VectorIndexes_ extends GenericTableVectorIndexes,
>({
  name,
  Fields,
  Doc,
  tableDefinition,
  indexes,
}: {
  name: Name_;
  Fields: TableSchema_;
  Doc: SystemFields.ExtendWithSystemFields<Name_, TableSchema_>;
  tableDefinition: TableDefinition<
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;
  indexes: Indexes_;
}): Table<
  Name_,
  TableSchema_,
  TableValidator_,
  Indexes_,
  SearchIndexes_,
  VectorIndexes_
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
  const Name_ extends string,
  TableSchema_ extends Schema.Schema.AnyNoContext,
  TableValidator_ extends
    GenericValidator = TableSchemaToTableValidator<TableSchema_>,
  Indexes_ extends GenericTableIndexes = {},
  SearchIndexes_ extends GenericTableSearchIndexes = {},
  VectorIndexes_ extends GenericTableVectorIndexes = {},
>(
  name: Name_,
  fields: TableSchema_,
): Table<
  Name_,
  TableSchema_,
  TableValidator_,
  Indexes_,
  SearchIndexes_,
  VectorIndexes_
> => {
  const tableValidator = compileTableSchema(fields) as any;
  const tableDefinition = defineTable(tableValidator) as any;

  return makeProto<
    Name_,
    TableSchema_,
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >({
    name,
    Fields: fields,
    Doc: SystemFields.extendWithSystemFields(name, fields),
    tableDefinition,
    indexes: {} as Indexes_,
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
