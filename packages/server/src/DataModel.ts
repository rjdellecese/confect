import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";
import type * as GenericId from "@confect/core/GenericId";

/**
 * @internal
 */
export declare const TypeId: "~@confect/server/DataModel";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export interface DataModel<
  Tables_ extends Readonly<Record<string, Table.AnyWithProps>>,
> {
  readonly [TypeId]: Readonly<Tables_>;
}

/**
 * @internal
 */
export interface Any {
  readonly [TypeId]: unknown;
}

/**
 * @internal
 */
export interface AnyWithProps extends DataModel<
  Readonly<Record<string, Table.AnyWithProps>>
> {}

/**
 * Types the generated native context and vector search tags. Import `QueryCtx`,
 * `MutationCtx`, `ActionCtx`, or `VectorSearch` from
 * `confect/_generated/services` instead of reconstructing the application's
 * model.
 *
 * @internal
 */
export type FromDatabaseSchema<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
> = DataModel<DatabaseSchema_[DatabaseSchema.TypeId]>;

/**
 * @internal
 */
export type FromTables<Tables_ extends Table.AnyWithProps> = DataModel<
  Table.TablesRecord<Tables_>
>;

/**
 * Types the schema-specific native context tags. Yield `QueryCtx`,
 * `MutationCtx`, or `ActionCtx` from `confect/_generated/services`; for the
 * native application model type, import `DataModel` from
 * `convex/_generated/dataModel`.
 *
 * @internal
 */
export type ToConvexDataModel<DataModel_ extends AnyWithProps> = {
  [TableName_ in TableNames<DataModel_>]: TableInfoWithName<
    DataModel_,
    TableName_
  >;
};

/**
 * @internal
 */
export type Tables<DataModel_ extends AnyWithProps> =
  DataModel_[TypeId][keyof DataModel_[TypeId]];

/**
 * @internal
 */
export type TableNames<DataModel_ extends AnyWithProps> = Table.Name<
  Tables<DataModel_>
> &
  string;

/**
 * @internal
 */
export type TableWithName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = Table.WithName<Tables<DataModel_>, TableName>;

/**
 * @internal
 */
export type TableInfoWithName_<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = TableInfo.TableInfo<Table.WithName<Tables<DataModel_>, TableName>>;

/**
 * @internal
 */
export type TableInfoWithName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = TableInfo.ConvexTableInfo<
  TableInfo.TableInfo<Table.WithName<Tables<DataModel_>, TableName>>
>;

/**
 * @internal
 */
export type DocumentWithName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = TableInfo.Document<
  TableInfo.TableInfo<Table.WithName<Tables<DataModel_>, TableName>>
>;

/**
 * @internal
 */
export type DocumentByName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = DocumentWithName<DataModel_, TableName>;

/**
 * Types IDs returned by database operations and vector searches. Use the
 * generated `Id<TableName>` type from `confect/_generated/id` in handlers.
 *
 * @internal
 */
export type Id<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = GenericId.GenericId<
  TableName,
  Table.Scope<TableWithName<DataModel_, TableName>>
>;
