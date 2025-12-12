import {
  defineTable as defineConvexTable,
  type Expand,
  type GenericTableIndexes,
  type GenericTableSearchIndexes,
  type GenericTableVectorIndexes,
  type IndexTiebreakerField,
  type SearchIndexConfig,
  type SystemFields,
  type TableDefinition,
  type VectorIndexConfig,
} from "convex/server";
import type { GenericValidator, Validator } from "convex/values";
import { Predicate, Schema } from "effect";
import {
  compileTableSchema,
  type TableSchemaToTableValidator,
} from "./SchemaToValidator";
import type { ExtendWithSystemFields } from "./SystemFields";
import { extendWithSystemFields } from "./SystemFields";

export const TypeId = "@rjdellecese/confect/ConfectTable";
export type TypeId = typeof TypeId;

export const isConfectTable = (u: unknown): u is ConfectTable.Any =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectTable<
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
  readonly Doc: ExtendWithSystemFields<TableName, TableSchema>;

  readonly indexes: Indexes;

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<TableValidator>,
    RestFieldPaths extends ExtractFieldPaths<TableValidator>[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ): ConfectTable<
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
  ): ConfectTable<
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
  ): ConfectTable<
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

export declare namespace ConfectTable {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export type AnyWithProps = ConfectTable<
    any,
    Schema.Schema.AnyNoContext,
    GenericValidator,
    GenericTableIndexes,
    GenericTableSearchIndexes,
    GenericTableVectorIndexes
  >;

  export type Name<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableName
      : never;

  export type TableSchema<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer _TableName,
      infer TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableSchema
      : never;

  export type TableValidator<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer _TableName,
      infer _TableSchema,
      infer TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableValidator
      : never;

  export type Indexes<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer _TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? Indexes
      : never;

  export type SearchIndexes<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer _TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer SearchIndexes,
      infer _VectorIndexes
    >
      ? SearchIndexes
      : never;

  export type VectorIndexes<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer _TableName,
      infer _TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer VectorIndexes
    >
      ? VectorIndexes
      : never;

  export type Doc<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer TableName,
      infer TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? ExtendWithSystemFields<TableName, TableSchema>
      : never;

  export type Fields<Table extends AnyWithProps> =
    Table extends ConfectTable<
      infer _TableName,
      infer TableSchema,
      infer _TableValidator,
      infer _Indexes,
      infer _SearchIndexes,
      infer _VectorIndexes
    >
      ? TableSchema
      : never;

  export type WithName<
    Table extends AnyWithProps,
    Name extends string,
  > = Extract<Table, { readonly name: Name }>;
}

const Proto = {
  [TypeId]: TypeId,

  index<
    IndexName extends string,
    FirstFieldPath extends string,
    RestFieldPaths extends string[],
  >(
    this: ConfectTable.AnyWithProps,
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
    this: ConfectTable.AnyWithProps,
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
    this: ConfectTable.AnyWithProps,
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
  Doc: ExtendWithSystemFields<TableName, TableSchema>;
  tableDefinition: TableDefinition<
    TableValidator,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >;
  indexes: Indexes;
}): ConfectTable<
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
 * Create a Confect table.
 */
export const make = <
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
>({
  name,
  fields,
}: {
  name: TableName;
  fields: TableSchema;
}): ConfectTable<TableName, TableSchema> => {
  const tableValidator = compileTableSchema(fields);
  const tableDefinition = defineConvexTable(tableValidator);

  return makeProto({
    name,
    Fields: fields,
    Doc: extendWithSystemFields(name, fields),
    tableDefinition,
    indexes: {},
  });
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

export const scheduledFunctionsTable = make({
  name: "_scheduled_functions",
  fields: Schema.Struct({
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
});

export const storageTable = make({
  name: "_storage",
  fields: Schema.Struct({
    sha256: Schema.String,
    size: Schema.Number,
    contentType: Schema.optionalWith(Schema.String, { exact: true }),
  }),
});

export const confectSystemTables = {
  _scheduled_functions: scheduledFunctionsTable,
  _storage: storageTable,
} as const;

export type ConfectSystemTables =
  | typeof scheduledFunctionsTable
  | typeof storageTable;

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
