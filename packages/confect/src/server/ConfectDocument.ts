import { Effect, Function, ParseResult, pipe, Schema } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import type * as ConfectDataModel from "./ConfectDataModel";
import type * as ConfectTableInfo from "./ConfectTableInfo";
import type { ReadonlyValue } from "./SchemaToValidator";
import * as SystemFields from "./SystemFields";

// TOD: Rename all `ConfectDocument` references to `ConfectDoc`
export declare namespace ConfectDocument {
  export type WithoutSystemFields<ConfectDocument> = Omit<
    ConfectDocument,
    "_creationTime" | "_id"
  >;

  export type Any = any;
  export type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;
}

export const decode = Function.dual<
  <
    ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    tableName: TableName,
    tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        ConfectDataModel_,
        TableName
      >
    >,
  ) => (
    self: ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["convexDocument"],
  ) => Effect.Effect<
    ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["confectDocument"],
    DocumentDecodeError
  >,
  <
    ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    self: ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["convexDocument"],
    tableName: TableName,
    tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        ConfectDataModel_,
        TableName
      >
    >,
  ) => Effect.Effect<
    ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["confectDocument"],
    DocumentDecodeError
  >
>(
  3,
  <
    ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    self: ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["convexDocument"],
    tableName: TableName,
    tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        ConfectDataModel_,
        TableName
      >
    >,
  ): Effect.Effect<
    ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["confectDocument"],
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
    ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    tableName: TableName,
    tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        ConfectDataModel_,
        TableName
      >
    >,
  ) => (
    self: ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["confectDocument"],
  ) => Effect.Effect<
    ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["encodedConfectDocument"],
    DocumentEncodeError
  >,
  <
    ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    self: ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["confectDocument"],
    tableName: TableName,
    tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        ConfectDataModel_,
        TableName
      >
    >,
  ) => Effect.Effect<
    ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["encodedConfectDocument"],
    DocumentEncodeError
  >
>(
  3,
  <
    ConfectDataModel_ extends ConfectDataModel.ConfectDataModel.AnyWithProps,
    TableName extends
      ConfectDataModel.ConfectDataModel.TableNames<ConfectDataModel_>,
  >(
    self: ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["confectDocument"],
    tableName: TableName,
    tableSchema: ConfectTableInfo.ConfectTableInfo.TableSchema<
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        ConfectDataModel_,
        TableName
      >
    >,
  ): Effect.Effect<
    ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      ConfectDataModel_,
      TableName
    >["encodedConfectDocument"],
    DocumentEncodeError
  > =>
    Effect.gen(function* () {
      type TableSchemaWithSystemFields = SystemFields.ExtendWithSystemFields<
        TableName,
        ConfectTableInfo.ConfectTableInfo.TableSchema<
          ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
            ConfectDataModel_,
            TableName
          >
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
