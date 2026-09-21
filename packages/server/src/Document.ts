import type { ReadonlyValue } from "@confect/core/SchemaToValidator";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Schema from "effect/Schema";
import type { ReadonlyRecord } from "effect/Record";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type * as TableInfo from "./TableInfo";

export type Document<
  Schema_ extends DatabaseSchema.AnyWithProps,
  TableName extends DatabaseSchema.TableNames<Schema_>,
> = DataModel.DocumentByName<DataModel.FromSchema<Schema_>, TableName>;

export type WithoutSystemFields<Doc> = Doc extends unknown
  ? Omit<Doc, "_creationTime" | "_id">
  : never;

export type Any = any;
export type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;

export const decode = Function.dual<
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    tableName: TableName,
    table: {
      readonly Doc: TableInfo.TableSchema<
        DataModel.TableInfoWithName_<DataModel_, TableName>
      >;
    },
  ) => (
    self: DataModel.TableInfoWithName_<DataModel_, TableName>["convexDocument"],
  ) => Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  >,
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.TableInfoWithName_<DataModel_, TableName>["convexDocument"],
    tableName: TableName,
    table: {
      readonly Doc: TableInfo.TableSchema<
        DataModel.TableInfoWithName_<DataModel_, TableName>
      >;
    },
  ) => Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  >
>(
  3,
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.TableInfoWithName_<DataModel_, TableName>["convexDocument"],
    tableName: TableName,
    table: {
      readonly Doc: TableInfo.TableSchema<
        DataModel.TableInfoWithName_<DataModel_, TableName>
      >;
    },
  ): Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  > =>
    pipe(
      self,
      Schema.decodeUnknownEffect(table.Doc),
      Effect.catchIf(Schema.isSchemaError, (schemaError) =>
        Effect.fail(
          new DocumentDecodeError({
            tableName,
            id: self._id,
            parseError: schemaError.message,
          }),
        ),
      ),
      Effect.map(
        (decodedDoc) =>
          decodedDoc as DataModel.TableInfoWithName_<
            DataModel_,
            TableName
          >["document"],
      ),
    ),
);

export const encode = Function.dual<
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    tableName: TableName,
    tableSchema: TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ) => (
    self: DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
  ) => Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["encodedDocument"],
    DocumentEncodeError
  >,
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    tableName: TableName,
    tableSchema: TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ) => Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["encodedDocument"],
    DocumentEncodeError
  >
>(
  3,
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    tableName: TableName,
    tableSchema: TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ): Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["encodedDocument"],
    DocumentEncodeError
  > =>
    pipe(
      self,
      Schema.encodeEffect(tableSchema),
      Effect.catchIf(Schema.isSchemaError, (schemaError) =>
        Effect.fail(
          new DocumentEncodeError({
            tableName,
            id: self._id,
            parseError: schemaError.message,
          }),
        ),
      ),
      Effect.map(
        (encodedDoc) =>
          encodedDoc as DataModel.TableInfoWithName_<
            DataModel_,
            TableName
          >["encodedDocument"],
      ),
    ),
);

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>()(
  "DocumentDecodeError",
  {
    tableName: Schema.String,
    id: Schema.String,
    parseError: Schema.String,
  },
) {
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be decoded:\n\n${this.parseError}`,
    });
  }
}

export class DocumentEncodeError extends Schema.TaggedError<DocumentEncodeError>()(
  "DocumentEncodeError",
  {
    tableName: Schema.String,
    id: Schema.String,
    parseError: Schema.String,
  },
) {
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be encoded:\n\n${this.parseError}`,
    });
  }
}

export const documentErrorMessage = ({
  id,
  tableName,
  message,
}: {
  id: string;
  tableName: string;
  message: string;
}) => `Document with ID '${id}' in table '${tableName}' ${message}`;
