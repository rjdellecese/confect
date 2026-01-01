import { Effect, Function, ParseResult, pipe, Schema } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import * as SystemFields from "../api/SystemFields";
import type * as DataModel from "./DataModel";
import type { ReadonlyValue } from "./SchemaToValidator";
import type * as TableInfo from "./TableInfo";

export declare namespace Document {
  export type WithoutSystemFields<Doc> = Omit<Doc, "_creationTime" | "_id">;

  export type Any = any;
  export type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;
}

export const decode = Function.dual<
  <
    DataModel_ extends DataModel.DataModel.AnyWithProps,
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    tableName: TableName,
    tableSchema: TableInfo.TableInfo.TableSchema<
      DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ) => (
    self: DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["convexDocument"],
  ) => Effect.Effect<
    DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  >,
  <
    DataModel_ extends DataModel.DataModel.AnyWithProps,
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["convexDocument"],
    tableName: TableName,
    tableSchema: TableInfo.TableInfo.TableSchema<
      DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ) => Effect.Effect<
    DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  >
>(
  3,
  <
    DataModel_ extends DataModel.DataModel.AnyWithProps,
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["convexDocument"],
    tableName: TableName,
    tableSchema: TableInfo.TableInfo.TableSchema<
      DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ): Effect.Effect<
    DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  > =>
    Effect.gen(function* () {
      const TableSchemaWithSystemFields = SystemFields.extendWithSystemFields(
        tableName,
        tableSchema,
      );

      const encodedDoc =
        self as (typeof TableSchemaWithSystemFields)["Encoded"];

      const decodedDoc = yield* pipe(
        encodedDoc,
        Schema.decode(TableSchemaWithSystemFields),
        Effect.catchTag("ParseError", (parseError) =>
          Effect.gen(function* () {
            const formattedParseError =
              yield* ParseResult.TreeFormatter.formatError(parseError);

            return yield* new DocumentDecodeError({
              tableName,
              id: encodedDoc._id,
              parseError: formattedParseError,
            });
          }),
        ),
      );

      return decodedDoc;
    }),
);

export const encode = Function.dual<
  <
    DataModel_ extends DataModel.DataModel.AnyWithProps,
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    tableName: TableName,
    tableSchema: TableInfo.TableInfo.TableSchema<
      DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ) => (
    self: DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["document"],
  ) => Effect.Effect<
    DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["encodedDocument"],
    DocumentEncodeError
  >,
  <
    DataModel_ extends DataModel.DataModel.AnyWithProps,
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["document"],
    tableName: TableName,
    tableSchema: TableInfo.TableInfo.TableSchema<
      DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ) => Effect.Effect<
    DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["encodedDocument"],
    DocumentEncodeError
  >
>(
  3,
  <
    DataModel_ extends DataModel.DataModel.AnyWithProps,
    TableName extends DataModel.DataModel.TableNames<DataModel_>,
  >(
    self: DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["document"],
    tableName: TableName,
    tableSchema: TableInfo.TableInfo.TableSchema<
      DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ): Effect.Effect<
    DataModel.DataModel.TableInfoWithName_<
      DataModel_,
      TableName
    >["encodedDocument"],
    DocumentEncodeError
  > =>
    Effect.gen(function* () {
      type TableSchemaWithSystemFields = SystemFields.ExtendWithSystemFields<
        TableName,
        TableInfo.TableInfo.TableSchema<
          DataModel.DataModel.TableInfoWithName_<DataModel_, TableName>
        >
      >;

      const decodedDoc = self as TableSchemaWithSystemFields["Type"];

      const encodedDoc = yield* pipe(
        decodedDoc,
        Schema.encode(tableSchema),
        Effect.catchTag("ParseError", (parseError) =>
          Effect.gen(function* () {
            const formattedParseError =
              yield* ParseResult.TreeFormatter.formatError(parseError);

            return yield* new DocumentEncodeError({
              tableName,
              id: decodedDoc._id,
              parseError: formattedParseError,
            });
          }),
        ),
      );

      return encodedDoc;
    }),
);

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>(
  "DocumentDecodeError",
)("DocumentDecodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.String,
}) {
  override get message(): string {
    return documentErrorMessage({
      id: this.id,
      tableName: this.tableName,
      message: `could not be decoded:\n\n${this.parseError}`,
    });
  }
}

export class DocumentEncodeError extends Schema.TaggedError<DocumentEncodeError>(
  "DocumentEncodeError",
)("DocumentEncodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.String,
}) {
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
