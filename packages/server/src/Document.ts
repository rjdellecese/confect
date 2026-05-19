import { Effect, Function, ParseResult, pipe, Schema } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import * as SystemFields from "@confect/core/SystemFields";
import type * as DataModel from "./DataModel";
import type { ReadonlyValue } from "./SchemaToValidator";
import type * as TableInfo from "./TableInfo";

export type WithoutSystemFields<Doc> = Omit<Doc, "_creationTime" | "_id">;

export type Any = any;
export type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;

type ExtendedTableSchema<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = SystemFields.ExtendWithSystemFields<TableName, TableSchema>;

type DocumentDecoder<
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
> = (
  doc: Schema.Schema.Encoded<ExtendedTableSchema<TableName, TableSchema>>,
) => Schema.Schema.Type<ExtendedTableSchema<TableName, TableSchema>>;

const decoderCache = new WeakMap<
  Schema.Schema.AnyNoContext,
  DocumentDecoder<string, Schema.Schema.AnyNoContext>
>();

const getDecoder = <
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
>(
  tableName: TableName,
  tableSchema: TableSchema,
): DocumentDecoder<TableName, TableSchema> => {
  const cached = decoderCache.get(tableSchema);
  if (cached !== undefined) {
    return cached as DocumentDecoder<TableName, TableSchema>;
  }

  const decoder = Schema.decodeUnknownSync(
    SystemFields.extendWithSystemFields(
      tableName,
      tableSchema,
    ) as unknown as ExtendedTableSchema<TableName, TableSchema> &
      Schema.Schema.AnyNoContext,
  ) as DocumentDecoder<TableName, TableSchema>;
  decoderCache.set(
    tableSchema,
    decoder as DocumentDecoder<string, Schema.Schema.AnyNoContext>,
  );
  return decoder;
};

export const decode = Function.dual<
  <
    DataModel_ extends DataModel.AnyWithProps,
    TableName extends DataModel.TableNames<DataModel_>,
  >(
    tableName: TableName,
    tableSchema: TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
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
    tableSchema: TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
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
    tableSchema: TableInfo.TableSchema<
      DataModel.TableInfoWithName_<DataModel_, TableName>
    >,
  ): Effect.Effect<
    DataModel.TableInfoWithName_<DataModel_, TableName>["document"],
    DocumentDecodeError
  > =>
    Effect.gen(function* () {
      const encodedDoc = self as Schema.Schema.Encoded<
        ExtendedTableSchema<TableName, typeof tableSchema>
      >;
      const decoder = getDecoder(tableName, tableSchema);

      const decodedDoc = yield* pipe(
        Effect.try({
          try: () => decoder(encodedDoc),
          catch: (error) => {
            if (ParseResult.isParseError(error)) {
              return error;
            }
            throw error;
          },
        }),
        Effect.catchIf(ParseResult.isParseError, (parseError) =>
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

      return decodedDoc as DataModel.TableInfoWithName_<
        DataModel_,
        TableName
      >["document"];
    }),
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
    Effect.gen(function* () {
      type TableSchemaWithSystemFields = SystemFields.ExtendWithSystemFields<
        TableName,
        TableInfo.TableSchema<
          DataModel.TableInfoWithName_<DataModel_, TableName>
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
