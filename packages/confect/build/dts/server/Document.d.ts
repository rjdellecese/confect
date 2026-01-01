import { ReadonlyValue } from "./SchemaToValidator.js";
import { DataModel } from "./DataModel.js";
import { TableInfo } from "./TableInfo.js";
import { Effect, Schema } from "effect";
import { ReadonlyRecord } from "effect/Record";

//#region src/server/Document.d.ts
declare namespace Document_d_exports {
  export { Document, DocumentDecodeError, DocumentEncodeError, decode, documentErrorMessage, encode };
}
declare namespace Document {
  type WithoutSystemFields<Doc> = Omit<Doc, "_creationTime" | "_id">;
  type Any = any;
  type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;
}
declare const decode: (<DataModel_ extends DataModel.AnyWithProps, TableName extends DataModel.TableNames<DataModel_>>(tableName: TableName, tableSchema: TableInfo.TableSchema<DataModel.TableInfoWithName_<DataModel_, TableName>>) => (self: DataModel.TableInfoWithName_<DataModel_, TableName>["convexDocument"]) => Effect.Effect<DataModel.TableInfoWithName_<DataModel_, TableName>["document"], DocumentDecodeError>) & (<DataModel_ extends DataModel.AnyWithProps, TableName extends DataModel.TableNames<DataModel_>>(self: DataModel.TableInfoWithName_<DataModel_, TableName>["convexDocument"], tableName: TableName, tableSchema: TableInfo.TableSchema<DataModel.TableInfoWithName_<DataModel_, TableName>>) => Effect.Effect<DataModel.TableInfoWithName_<DataModel_, TableName>["document"], DocumentDecodeError>);
declare const encode: (<DataModel_ extends DataModel.AnyWithProps, TableName extends DataModel.TableNames<DataModel_>>(tableName: TableName, tableSchema: TableInfo.TableSchema<DataModel.TableInfoWithName_<DataModel_, TableName>>) => (self: DataModel.TableInfoWithName_<DataModel_, TableName>["document"]) => Effect.Effect<DataModel.TableInfoWithName_<DataModel_, TableName>["encodedDocument"], DocumentEncodeError>) & (<DataModel_ extends DataModel.AnyWithProps, TableName extends DataModel.TableNames<DataModel_>>(self: DataModel.TableInfoWithName_<DataModel_, TableName>["document"], tableName: TableName, tableSchema: TableInfo.TableSchema<DataModel.TableInfoWithName_<DataModel_, TableName>>) => Effect.Effect<DataModel.TableInfoWithName_<DataModel_, TableName>["encodedDocument"], DocumentEncodeError>);
declare const DocumentDecodeError_base: Schema.TaggedErrorClass<DocumentDecodeError, "DocumentDecodeError", {
  readonly _tag: Schema.tag<"DocumentDecodeError">;
} & {
  tableName: typeof Schema.String;
  id: typeof Schema.String;
  parseError: typeof Schema.String;
}>;
declare class DocumentDecodeError extends DocumentDecodeError_base {
  get message(): string;
}
declare const DocumentEncodeError_base: Schema.TaggedErrorClass<DocumentEncodeError, "DocumentEncodeError", {
  readonly _tag: Schema.tag<"DocumentEncodeError">;
} & {
  tableName: typeof Schema.String;
  id: typeof Schema.String;
  parseError: typeof Schema.String;
}>;
declare class DocumentEncodeError extends DocumentEncodeError_base {
  get message(): string;
}
declare const documentErrorMessage: ({
  id,
  tableName,
  message
}: {
  id: string;
  tableName: string;
  message: string;
}) => string;
//#endregion
export { Document, DocumentDecodeError, DocumentEncodeError, Document_d_exports, decode, documentErrorMessage, encode };
//# sourceMappingURL=Document.d.ts.map