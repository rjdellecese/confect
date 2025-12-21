import type * as ConfectSchema from "./ConfectSchema";
import type * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";

export declare const TypeId: "@rjdellecese/confect/ConfectDataModel";
export type TypeId = typeof TypeId;

export interface ConfectDataModel<
  Tables extends ConfectTable.ConfectTable.AnyWithProps,
> {
  readonly [TypeId]: TypeId;
  readonly tables: ConfectTable.ConfectTable.TablesRecord<Tables>;
}

export declare namespace ConfectDataModel {
  export interface Any {
    readonly [TypeId]: TypeId;
  }

  export interface AnyWithProps extends Any {
    readonly tables: Record<string, ConfectTable.ConfectTable.AnyWithProps>;
  }

  export type FromSchema<
    ConfectSchema_ extends ConfectSchema.ConfectSchema.AnyWithProps,
  > = ConfectDataModel<ConfectSchema.ConfectSchema.Tables<ConfectSchema_>>;

  export type FromTables<
    Tables_ extends ConfectTable.ConfectTable.AnyWithProps,
  > = ConfectDataModel<Tables_>;

  export type DataModel<ConfectDataModel_ extends AnyWithProps> = {
    [TableName_ in TableNames<ConfectDataModel_>]: TableInfoWithName<
      ConfectDataModel_,
      TableName_
    >;
  };

  export type Tables<ConfectDataModel_ extends AnyWithProps> =
    ConfectDataModel_ extends ConfectDataModel<infer Tables_> ? Tables_ : never;

  export type TableNames<ConfectDataModel_ extends AnyWithProps> =
    ConfectTable.ConfectTable.Name<Tables<ConfectDataModel_>> & string;

  export type TableWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTable.ConfectTable.WithName<Tables<ConfectDataModel_>, TableName>;

  export type ConfectTableInfoWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTableInfo.ConfectTableInfo<
    ConfectTable.ConfectTable.WithName<Tables<ConfectDataModel_>, TableName>
  >;

  export type TableInfoWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTableInfo.ConfectTableInfo.TableInfo<
    ConfectTableInfo.ConfectTableInfo<
      ConfectTable.ConfectTable.WithName<Tables<ConfectDataModel_>, TableName>
    >
  >;

  export type ConfectDocumentWithName<
    ConfectDataModel_ extends AnyWithProps,
    TableName extends TableNames<ConfectDataModel_>,
  > = ConfectTableInfo.ConfectTableInfo.ConfectDocument<
    ConfectTableInfo.ConfectTableInfo<
      ConfectTable.ConfectTable.WithName<Tables<ConfectDataModel_>, TableName>
    >
  >;
}

export type ConfectDocumentByName<
  ConfectDataModel_ extends ConfectDataModel.AnyWithProps,
  TableName extends ConfectDataModel.TableNames<ConfectDataModel_>,
> = ConfectDataModel.ConfectDocumentWithName<ConfectDataModel_, TableName>;
