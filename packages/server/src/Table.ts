import * as Lazy from "@confect/core/Lazy";
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
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { runSyncThrowInIsolate } from "./internal/runSyncInIsolate";
import {
  type CompileError,
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
  TableSchema_ extends Schema.Codec<any, any>,
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
// `UnnamedTable`s, accumulating plain index metadata records. Neither the
// field-schema nor the deploy-time `tableDefinition` is constructed at this
// stage — the user-supplied `lazyFields` callback is just carried through.
// The codegen pipeline emits a wrapper file per user-authored table that
// simply invokes the unnamed callable with the filename basename.

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
//
// `make` only stores the user-supplied `lazyFields` callback alongside any
// chained index metadata. Neither `Fields` nor `Doc` nor `tableDefinition`
// is constructed until first access on a bound `Table`. Each chain step is
// O(1) (plain object spread of the metadata records) and never invokes the
// callback. Binding via `unnamed(tableName)` installs lazy memoised getters
// for `Fields`, `Doc`, and `tableDefinition` via `Lazy.defineProperty`, so the
// first access materialises the value and replaces the getter with a plain
// data property — second-and-subsequent accesses are observably
// indistinguishable from a plain property and avoid all function-call
// overhead.

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

  const computeTableDefinition = (): Effect.Effect<
    TableDefinition<any, any, any, any>,
    CompileError
  > =>
    Effect.map(
      compileTableSchema((bound as { Fields: TableSchema_ }).Fields),
      (validator) => {
        let definition: TableDefinition<any, any, any, any> =
          defineTable(validator);
        for (const [name, indexFields] of Object.entries(
          state.indexes as Record<string, any>,
        )) {
          definition = definition.index(name, indexFields);
        }
        for (const [name, config] of Object.entries(
          state.searchIndexes as Record<string, any>,
        )) {
          definition = definition.searchIndex(name, config);
        }
        for (const [name, config] of Object.entries(
          state.vectorIndexes as Record<string, any>,
        )) {
          definition = definition.vectorIndex(name, config);
        }
        return definition;
      },
    );

  // Memoised outside the Lazy getter so the Effect path (`ConvexSchema.make`)
  // and the getter share one computation: whichever runs first caches, and
  // both return the identical `TableDefinition` instance. On failure nothing
  // is cached (and the Lazy property is never installed), so both paths retry
  // — the same semantics the getter had when it compiled directly.
  let cachedTableDefinition: TableDefinition<any, any, any, any> | undefined;
  const tableDefinitionEffect = Effect.suspend(() =>
    cachedTableDefinition !== undefined
      ? Effect.succeed(cachedTableDefinition)
      : Effect.map(computeTableDefinition(), (definition) => {
          cachedTableDefinition = definition;
          return definition;
        }),
  );

  Object.defineProperty(bound, TableDefinitionEffectKey, {
    value: tableDefinitionEffect,
    enumerable: false,
  });

  Lazy.defineProperty(bound, "tableDefinition", () =>
    runSyncThrowInIsolate(tableDefinitionEffect),
  );

  return bound;
};

const TableDefinitionEffectKey = "~confect/server/Table/tableDefinitionEffect";

/**
 * The `Effect` that compiles a bound table's Convex `TableDefinition`. Shares
 * its memo with the `tableDefinition` getter, so both paths yield the same
 * instance. Consumed by `ConvexSchema.make` to compile a whole schema's
 * tables under a single isolate-safe execution boundary.
 */
export const compileTableDefinition = (
  table: AnyWithProps,
): Effect.Effect<TableDefinition<any, any, any, any>, CompileError> =>
  (table as any)[TableDefinitionEffectKey];

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
    index,
    searchIndex,
    vectorIndex,
  }) satisfies UnnamedTable_;
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
  }) satisfies UnnamedTable_;
};

// -----------------------------------------------------------------------------
// System tables
// -----------------------------------------------------------------------------

export const scheduledFunctionsTable = make(() =>
  Schema.Struct({
    name: Schema.String,
    args: Schema.Array(Schema.Any),
    scheduledTime: Schema.Number,
    completedTime: Schema.optionalKey(Schema.Number),
    state: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("pending") }),
      Schema.Struct({ kind: Schema.Literal("inProgress") }),
      Schema.Struct({ kind: Schema.Literal("success") }),
      Schema.Struct({
        kind: Schema.Literal("failed"),
        error: Schema.String,
      }),
      Schema.Struct({ kind: Schema.Literal("canceled") }),
    ]),
  }),
)("_scheduled_functions");

export const storageTable = make(() =>
  Schema.Struct({
    sha256: Schema.String,
    size: Schema.Number,
    contentType: Schema.optionalKey(Schema.String),
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
