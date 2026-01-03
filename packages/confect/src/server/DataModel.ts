import type * as DatabaseSchema from "./DatabaseSchema";
import type * as Table from "./Table";
import type * as TableInfo from "./TableInfo";

export declare const TypeId: "@rjdellecese/confect/server/DataModel";
export type TypeId = typeof TypeId;

export interface DataModel<Tables_ extends Table.AnyWithProps> {
  readonly [TypeId]: TypeId;
  readonly tables: Table.TablesRecord<Tables_>;
}

export interface Any {
  readonly [TypeId]: TypeId;
}

export interface AnyWithProps extends Any {
  readonly tables: Record<string, Table.AnyWithProps>;
}

export type FromSchema<Schema extends DatabaseSchema.AnyWithProps> = DataModel<
  DatabaseSchema.Tables<Schema>
>;

export type FromTables<Tables_ extends Table.AnyWithProps> = DataModel<Tables_>;

export type ToConvex<DataModel_ extends AnyWithProps> = {
  [TableName_ in TableNames<DataModel_>]: TableInfoWithName<
    DataModel_,
    TableName_
  >;
};

export type Tables<DataModel_ extends AnyWithProps> =
  DataModel_ extends DataModel<infer Tables_> ? Tables_ : never;

export type TableNames<DataModel_ extends AnyWithProps> = Table.Name<
  Tables<DataModel_>
> &
  string;

export type TableWithName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = Table.WithName<Tables<DataModel_>, TableName>;

export type TableInfoWithName_<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = TableInfo.TableInfo<Table.WithName<Tables<DataModel_>, TableName>>;

export type TableInfoWithName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = TableInfo.ConvexTableInfo<
  TableInfo.TableInfo<Table.WithName<Tables<DataModel_>, TableName>>
>;

export type DocumentWithName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = TableInfo.Document<
  TableInfo.TableInfo<Table.WithName<Tables<DataModel_>, TableName>>
>;

export type DocumentByName<
  DataModel_ extends AnyWithProps,
  TableName extends TableNames<DataModel_>,
> = DocumentWithName<DataModel_, TableName>;
