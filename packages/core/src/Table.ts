import * as Lazy from "./Lazy";
import * as SystemFields from "./SystemFields";
import type { TableSchemaToTableValidator } from "./SchemaToValidator";
import type {
  SystemFields as ConvexSystemFields,
  Expand,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IndexTiebreakerField,
  SearchIndexConfig,
  VectorIndexConfig,
} from "convex/server";
import type { GenericValidator, Validator } from "convex/values";
import * as Predicate from "effect/Predicate";
import type * as Schema from "effect/Schema";

export const TypeId = "~@confect/core/Table";
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
//
// A bound `Table` is the client-safe document schema: `Fields`, `Doc`, and
// the index metadata records. The Convex deploy `tableDefinition` (which
// value-imports `convex/server`) is produced separately by
// `@confect/server/Table.tableDefinition`.

export interface Table<
  Name_ extends string,
  TableSchema_ extends Schema.Codec<any, any>,
  TableValidator_ extends GenericValidator =
    TableSchemaToTableValidator<TableSchema_>,
  Indexes_ extends GenericTableIndexes = {},
  SearchIndexes_ extends GenericTableSearchIndexes = {},
  VectorIndexes_ extends GenericTableVectorIndexes = {},
> {
  readonly [TypeId]: TypeId;
  readonly tableName: Name_;
  readonly Fields: TableSchema_;
  readonly Doc: SystemFields.ExtendWithSystemFields<Name_, TableSchema_>;
  readonly indexes: Indexes_;
  readonly searchIndexes: SearchIndexes_;
  readonly vectorIndexes: VectorIndexes_;
  readonly "~TableValidator": TableValidator_;
}

export interface Any {
  readonly [TypeId]: TypeId;
  readonly tableName: string;
}

export type AnyWithProps = Table<
  any,
  Schema.Codec<any, any>,
  GenericValidator,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes
>;

// -----------------------------------------------------------------------------
// UnnamedTable (callable)
// -----------------------------------------------------------------------------
//
// `Table.make(lazyFields)` returns an `UnnamedTable`: a callable that
// produces a fully bound `Table` when invoked with a name. Chaining methods
// (`.index`, `.searchIndex`, `.vectorIndex`) live here and return new
// `UnnamedTable`s, accumulating plain index metadata records. The
// user-supplied `lazyFields` callback is just carried through until first
// access of `Fields` / `Doc` on a bound table. The codegen pipeline emits a
// wrapper file per user-authored table that simply invokes the unnamed
// callable with the filename basename.

export interface UnnamedTable<
  TableSchema_ extends Schema.Codec<any, any>,
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
  readonly indexes: Indexes_;
  readonly searchIndexes: SearchIndexes_;
  readonly vectorIndexes: VectorIndexes_;
  readonly "~TableValidator": TableValidator_;

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
  Schema.Codec<any, any>,
  GenericValidator,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes
>;

// -----------------------------------------------------------------------------
// Type extractors
// -----------------------------------------------------------------------------

export type Name<TableDef extends AnyWithProps> = TableDef["tableName"] &
  string;

export type TableSchema<TableDef extends AnyWithProps> = TableDef["Fields"];

export type TableValidator<TableDef extends AnyWithProps> =
  TableDef["~TableValidator"];

export type Indexes<TableDef extends AnyWithProps> = TableDef["indexes"];

export type SearchIndexes<TableDef extends AnyWithProps> =
  TableDef["searchIndexes"];

export type VectorIndexes<TableDef extends AnyWithProps> =
  TableDef["vectorIndexes"];

export type Doc<TableDef extends AnyWithProps> = TableDef["Doc"];

export type Fields<TableDef extends AnyWithProps> = TableDef["Fields"];

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
//
// `make` only stores the user-supplied `lazyFields` callback alongside any
// chained index metadata. Neither `Fields` nor `Doc` is constructed until
// first access on a bound `Table`. Each chain step is O(1) (plain object
// spread of the metadata records) and never invokes the callback. Binding
// via `unnamed(tableName)` installs lazy memoised getters for `Fields` and
// `Doc` via `Lazy.defineProperty`, so the first access materialises the
// value and replaces the getter with a plain data property — second-and-
// subsequent accesses are observably indistinguishable from a plain
// property and avoid all function-call overhead.

interface UnnamedState<
  TableSchema_ extends Schema.Codec<any, any>,
  Indexes_ extends GenericTableIndexes,
  SearchIndexes_ extends GenericTableSearchIndexes,
  VectorIndexes_ extends GenericTableVectorIndexes,
> {
  readonly lazyFields: () => TableSchema_;
  readonly indexes: Indexes_;
  readonly searchIndexes: SearchIndexes_;
  readonly vectorIndexes: VectorIndexes_;
}

const makeBound = <
  Name_ extends string,
  TableSchema_ extends Schema.Codec<any, any>,
  TableValidator_ extends Validator<any, any, any>,
  Indexes_ extends GenericTableIndexes,
  SearchIndexes_ extends GenericTableSearchIndexes,
  VectorIndexes_ extends GenericTableVectorIndexes,
>(
  tableName: Name_,
  state: UnnamedState<TableSchema_, Indexes_, SearchIndexes_, VectorIndexes_>,
): Table<
  Name_,
  TableSchema_,
  TableValidator_,
  Indexes_,
  SearchIndexes_,
  VectorIndexes_
> => {
  const bound = {
    [TypeId]: TypeId as TypeId,
    tableName,
    indexes: state.indexes,
    searchIndexes: state.searchIndexes,
    vectorIndexes: state.vectorIndexes,
  } as Table<
    Name_,
    TableSchema_,
    TableValidator_,
    Indexes_,
    SearchIndexes_,
    VectorIndexes_
  >;

  Lazy.defineProperty(bound, "Fields", () => state.lazyFields());

  Lazy.defineProperty(bound, "Doc", () =>
    SystemFields.extendWithSystemFields(
      tableName,
      (bound as { Fields: TableSchema_ }).Fields,
    ),
  );

  return bound;
};

const makeUnnamed = <
  TableSchema_ extends Schema.Codec<any, any>,
  TableValidator_ extends Validator<any, any, any>,
  Indexes_ extends GenericTableIndexes,
  SearchIndexes_ extends GenericTableSearchIndexes,
  VectorIndexes_ extends GenericTableVectorIndexes,
>(
  state: UnnamedState<TableSchema_, Indexes_, SearchIndexes_, VectorIndexes_>,
): UnnamedTable<
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
    makeBound<
      Name_,
      TableSchema_,
      TableValidator_,
      Indexes_,
      SearchIndexes_,
      VectorIndexes_
    >(tableName, state);

  const index: UnnamedTableFunction<"index"> = (name, fields) =>
    makeUnnamed({
      lazyFields: state.lazyFields,
      indexes: {
        ...state.indexes,
        [name]: fields,
      } as any,
      searchIndexes: state.searchIndexes,
      vectorIndexes: state.vectorIndexes,
    });

  const searchIndex: UnnamedTableFunction<"searchIndex"> = (
    name,
    indexConfig,
  ) =>
    makeUnnamed({
      lazyFields: state.lazyFields,
      indexes: state.indexes,
      searchIndexes: {
        ...state.searchIndexes,
        [name]: indexConfig,
      } as any,
      vectorIndexes: state.vectorIndexes,
    });

  const vectorIndex: UnnamedTableFunction<"vectorIndex"> = (
    name,
    indexConfig,
  ) =>
    makeUnnamed({
      lazyFields: state.lazyFields,
      indexes: state.indexes,
      searchIndexes: state.searchIndexes,
      vectorIndexes: {
        ...state.vectorIndexes,
        [name]: indexConfig,
      } as any,
    });

  return Object.assign(bind, {
    [TypeId]: TypeId as TypeId,
    indexes: state.indexes,
    searchIndexes: state.searchIndexes,
    vectorIndexes: state.vectorIndexes,
    index,
    searchIndex,
    vectorIndex,
  }) as UnnamedTable_;
};

export const make = <const TableSchema_ extends Schema.Codec<any, any>>(
  lazyFields: () => TableSchema_,
): UnnamedTable<TableSchema_, TableSchemaToTableValidator<TableSchema_>> => {
  type TableValidator_ = TableSchemaToTableValidator<TableSchema_>;
  type UnnamedTable_ = UnnamedTable<TableSchema_, TableValidator_>;

  return makeUnnamed<TableSchema_, TableValidator_, {}, {}, {}>({
    lazyFields,
    indexes: {},
    searchIndexes: {},
    vectorIndexes: {},
  }) as UnnamedTable_;
};

// Vendored types from convex-js, partially modified. Ideally we could use these directly. See https://github.com/get-convex/convex-js/pull/14

/**
 * Extract all of the index field paths within a Convex `Validator`.
 *
 * This is used when declaring table indexes.
 * @public
 */
type ExtractFieldPaths<T extends Validator<any, any, any>> =
  // Add in the system fields available in index definitions.
  // This should be everything except for `_id` because thats added to indexes
  // automatically.
  T["fieldPaths"] | keyof ConvexSystemFields;
