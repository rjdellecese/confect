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

// -----------------------------------------------------------------------------
// Predicates
// -----------------------------------------------------------------------------
//
// Both bound `Table`s and `UnnamedTable` callables share the same `[TypeId]`
// brand. They disambiguate by whether a `tableName` property is set: bound
// tables have one, unnamed callables do not.
//
// The discriminator is `tableName` (not `name`) so it does not collide with
// the built-in `Function.prototype.name` that every JS function carries.

export const isTable = (u: unknown): u is Any =>
  Predicate.hasProperty(u, TypeId) && Predicate.hasProperty(u, "tableName");

export const isUnnamedTable = (u: unknown): u is UnnamedAny =>
  Predicate.hasProperty(u, TypeId) && !Predicate.hasProperty(u, "tableName");

// -----------------------------------------------------------------------------
// Bound Table
// -----------------------------------------------------------------------------

export interface Table<
  Name_ extends string,
  TableSchema_ extends Schema.Schema.AnyNoContext,
  TableValidator_ extends GenericValidator =
    TableSchemaToTableValidator<TableSchema_>,
  Indexes_ extends GenericTableIndexes = {},
  SearchIndexes_ extends GenericTableSearchIndexes = {},
  VectorIndexes_ extends GenericTableVectorIndexes = {},
> {
  readonly [TypeId]: TypeId;
  readonly tableName: Name_;
  readonly tableDefinition: TableDefinition<
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;
  readonly Fields: TableSchema_;
  readonly Doc: SystemFields.ExtendWithSystemFields<Name_, TableSchema_>;
  readonly indexes: Indexes_;
}

export interface Any {
  readonly [TypeId]: TypeId;
  readonly tableName: string;
}

export type AnyWithProps = Table<
  any,
  Schema.Schema.AnyNoContext,
  GenericValidator,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes
>;

// -----------------------------------------------------------------------------
// UnnamedTable (callable)
// -----------------------------------------------------------------------------
//
// `Table.make(fields)` returns an `UnnamedTable`: a callable that produces a
// fully bound `Table` when invoked with a name. Chaining methods (`.index`,
// `.searchIndex`, `.vectorIndex`) live here and return new `UnnamedTable`s, so
// indexes are accumulated before the name is bound. The codegen pipeline emits
// a wrapper file per user-authored table that simply invokes the unnamed
// callable with the filename basename.

export interface UnnamedTable<
  TableSchema_ extends Schema.Schema.AnyNoContext,
  TableValidator_ extends GenericValidator =
    TableSchemaToTableValidator<TableSchema_>,
  Indexes_ extends GenericTableIndexes = {},
  SearchIndexes_ extends GenericTableSearchIndexes = {},
  VectorIndexes_ extends GenericTableVectorIndexes = {},
> {
  <const Name_ extends string>(
    tableName: Name_,
  ): Table<
    Name_,
    TableSchema_,
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;

  readonly [TypeId]: TypeId;
  readonly Fields: TableSchema_;
  readonly tableDefinition: TableDefinition<
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;
  readonly indexes: Indexes_;

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<TableValidator_>,
    RestFieldPaths extends ExtractFieldPaths<TableValidator_>[],
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths],
  ): UnnamedTable<
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
  ): UnnamedTable<
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
  ): UnnamedTable<
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

export interface UnnamedAny {
  readonly [TypeId]: TypeId;
}

export type UnnamedAnyWithProps = UnnamedTable<
  Schema.Schema.AnyNoContext,
  GenericValidator,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes
>;

// -----------------------------------------------------------------------------
// Type extractors
// -----------------------------------------------------------------------------

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
> = TableDef extends { readonly tableName: Name_ } ? TableDef : never;

export type TablesRecord<Tables extends AnyWithProps> = {
  readonly [TableName_ in Name<Tables>]: WithName<Tables, TableName_>;
};

// -----------------------------------------------------------------------------
// Construction
// -----------------------------------------------------------------------------

const makeBound = <
  Name_ extends string,
  TableSchema_ extends Schema.Schema.AnyNoContext,
  TableValidator_ extends Validator<any, any, any>,
  Indexes_ extends GenericTableIndexes,
  SearchIndexes_ extends GenericTableSearchIndexes,
  VectorIndexes_ extends GenericTableVectorIndexes,
>({
  tableName,
  Fields,
  Doc,
  tableDefinition,
  indexes,
}: {
  tableName: Name_;
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
> => ({
  [TypeId]: TypeId,
  tableName,
  Fields,
  Doc,
  tableDefinition,
  indexes,
});

const makeUnnamed = <
  TableSchema_ extends Schema.Schema.AnyNoContext,
  TableValidator_ extends Validator<any, any, any>,
  Indexes_ extends GenericTableIndexes,
  SearchIndexes_ extends GenericTableSearchIndexes,
  VectorIndexes_ extends GenericTableVectorIndexes,
>({
  Fields,
  tableDefinition,
  indexes,
}: {
  Fields: TableSchema_;
  tableDefinition: TableDefinition<
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;
  indexes: Indexes_;
}): UnnamedTable<
  TableSchema_,
  TableValidator_,
  Indexes_,
  SearchIndexes_,
  VectorIndexes_
> => {
  type UnnamedTable_ = UnnamedTable<
    TableSchema_,
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;

  type UnnamedTableFunction<FunctionName extends keyof UnnamedTable_> =
    UnnamedTable_[FunctionName];

  const bind = <const Name_ extends string>(
    tableName: Name_,
  ): Table<
    Name_,
    TableSchema_,
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  > =>
    makeBound({
      tableName,
      Fields,
      Doc: SystemFields.extendWithSystemFields(tableName as any, Fields) as any,
      tableDefinition,
      indexes,
    });

  const index: UnnamedTableFunction<"index"> = (name, fields) =>
    makeUnnamed({
      Fields,
      tableDefinition: tableDefinition.index(name as any, fields as any) as any,
      indexes: { ...indexes, [name]: fields } as any,
    });

  const searchIndex: UnnamedTableFunction<"searchIndex"> = (
    name,
    indexConfig,
  ) =>
    makeUnnamed({
      Fields,
      tableDefinition: tableDefinition.searchIndex(
        name as any,
        indexConfig as any,
      ) as any,
      indexes,
    });

  const vectorIndex: UnnamedTableFunction<"vectorIndex"> = (
    name,
    indexConfig,
  ) =>
    makeUnnamed({
      Fields,
      tableDefinition: tableDefinition.vectorIndex(
        name as any,
        indexConfig as any,
      ) as any,
      indexes,
    });

  return Object.assign(bind, {
    [TypeId]: TypeId as TypeId,
    Fields,
    tableDefinition,
    indexes,
    index,
    searchIndex,
    vectorIndex,
  }) satisfies UnnamedTable_;
};

export const make = <
  const TableSchema_ extends Schema.Schema.AnyNoContext,
>(
  fields: TableSchema_,
): UnnamedTable<
  TableSchema_,
  TableSchemaToTableValidator<TableSchema_>
> => {
  type TableValidator_ = TableSchemaToTableValidator<TableSchema_>;
  type UnnamedTable_ = UnnamedTable<TableSchema_, TableValidator_>;

  const tableValidator = compileTableSchema(fields);
  const tableDefinition = defineTable(tableValidator);

  return makeUnnamed<
    TableSchema_,
    TableValidator_,
    {},
    {},
    {}
  >({
    Fields: fields,
    tableDefinition,
    indexes: {},
  }) satisfies UnnamedTable_;
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

export const scheduledFunctionsTable = make(
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
)("_scheduled_functions");

export const storageTable = make(
  Schema.Struct({
    sha256: Schema.String,
    size: Schema.Number,
    contentType: Schema.optionalWith(Schema.String, { exact: true }),
  }),
)("_storage");

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
