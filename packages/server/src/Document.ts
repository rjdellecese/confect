import * as SystemFields from "@confect/core/SystemFields";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import type { ReadonlyRecord } from "effect/Record";
import type * as DataModel from "./DataModel";
import type { ReadonlyValue } from "./SchemaToValidator";
import type * as TableInfo from "./TableInfo";

export type WithoutSystemFields<Doc> = Omit<Doc, "_creationTime" | "_id">;

export type Any = any;
export type AnyEncoded = ReadonlyRecord<string, ReadonlyValue>;

type Decode = (doc: unknown) => Effect.Effect<unknown, ParseResult.ParseError>;

const decoderCache = new WeakMap<
  Schema.Schema.AnyNoContext,
  Map<string, Decode>
>();

const getDecoder = (
  tableName: string,
  tableSchema: Schema.Schema.AnyNoContext,
): Decode => {
  const byTable =
    decoderCache.get(tableSchema) ??
    (() => {
      const map = new Map<string, Decode>();
      decoderCache.set(tableSchema, map);
      return map;
    })();

  return (
    byTable.get(tableName) ??
    (() => {
      const decoder = Schema.decode(
        SystemFields.extendWithSystemFields(tableName, tableSchema),
      ) as Decode;
      byTable.set(tableName, decoder);
      return decoder;
    })()
  );
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
    pipe(
      self,
      getDecoder(tableName, tableSchema),
      Effect.catchIf(ParseResult.isParseError, (parseError) =>
        Effect.gen(function* () {
          const formattedParseError =
            yield* ParseResult.TreeFormatter.formatError(parseError);

          return yield* new DocumentDecodeError({
            tableName,
            id: self._id,
            parseError: formattedParseError,
          });
        }),
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

type Encode = (doc: unknown) => Effect.Effect<unknown, ParseResult.ParseError>;

const encoderCache = new WeakMap<Schema.Schema.AnyNoContext, Encode>();

const getEncoder = (tableSchema: Schema.Schema.AnyNoContext): Encode =>
  encoderCache.get(tableSchema) ??
  (() => {
    const encoder = Schema.encode(tableSchema) as Encode;
    encoderCache.set(tableSchema, encoder);
    return encoder;
  })();

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
      getEncoder(tableSchema),
      Effect.catchIf(ParseResult.isParseError, (parseError) =>
        Effect.gen(function* () {
          const formattedParseError =
            yield* ParseResult.TreeFormatter.formatError(parseError);

          return yield* new DocumentEncodeError({
            tableName,
            id: self._id,
            parseError: formattedParseError,
          });
        }),
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
