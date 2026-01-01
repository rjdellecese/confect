import { Table } from "./Table.js";
import { DatabaseSchema } from "./DatabaseSchema.js";
import { TableInfo } from "./TableInfo.js";

//#region src/server/DataModel.d.ts
declare namespace DataModel_d_exports {
  export { DataModel, DocumentByName, TypeId };
}
declare const TypeId: "@rjdellecese/confect/server/DataModel";
type TypeId = typeof TypeId;
interface DataModel<Tables$1 extends Table.AnyWithProps> {
  readonly [TypeId]: TypeId;
  readonly tables: Table.TablesRecord<Tables$1>;
}
declare namespace DataModel {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps extends Any {
    readonly tables: Record<string, Table.AnyWithProps>;
  }
  type FromSchema<Schema extends DatabaseSchema.AnyWithProps> = DataModel<DatabaseSchema.Tables<Schema>>;
  type FromTables<Tables_ extends Table.AnyWithProps> = DataModel<Tables_>;
  type ToConvex<DataModel_ extends AnyWithProps> = { [TableName_ in TableNames<DataModel_>]: TableInfoWithName<DataModel_, TableName_> };
  type Tables<DataModel_ extends AnyWithProps> = DataModel_ extends DataModel<infer Tables_> ? Tables_ : never;
  type TableNames<DataModel_ extends AnyWithProps> = Table.Name<Tables<DataModel_>> & string;
  type TableWithName<DataModel_ extends AnyWithProps, TableName extends TableNames<DataModel_>> = Table.WithName<Tables<DataModel_>, TableName>;
  type TableInfoWithName_<DataModel_ extends AnyWithProps, TableName extends TableNames<DataModel_>> = TableInfo<Table.WithName<Tables<DataModel_>, TableName>>;
  type TableInfoWithName<DataModel_ extends AnyWithProps, TableName extends TableNames<DataModel_>> = TableInfo.TableInfo<TableInfo<Table.WithName<Tables<DataModel_>, TableName>>>;
  type DocumentWithName<DataModel_ extends AnyWithProps, TableName extends TableNames<DataModel_>> = TableInfo.Document<TableInfo<Table.WithName<Tables<DataModel_>, TableName>>>;
}
type DocumentByName<DataModel_ extends DataModel.AnyWithProps, TableName extends DataModel.TableNames<DataModel_>> = DataModel.DocumentWithName<DataModel_, TableName>;
//#endregion
export { DataModel, DataModel_d_exports, DocumentByName, TypeId };
//# sourceMappingURL=DataModel.d.ts.map