import type { ReadonlyValue } from "@confect/core/SchemaToValidator";
import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Schema from "effect/Schema";
import type { ReadonlyRecord } from "effect/Record";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type * as TableInfo from "./TableInfo";
import type * as Table from "./Table";

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
  <Table_ extends Table.AnyWithProps>(
    table: Table_,
  ) => (
    self: TableInfo.TableInfo<Table_>["convexDocument"],
  ) => Effect.Effect<
    TableInfo.TableInfo<Table_>["document"],
    DocumentDecodeError
  >,
  <Table_ extends Table.AnyWithProps>(
    self: TableInfo.TableInfo<Table_>["convexDocument"],
    table: Table_,
  ) => Effect.Effect<
    TableInfo.TableInfo<Table_>["document"],
    DocumentDecodeError
  >
>(
  2,
  <Table_ extends Table.AnyWithProps>(
    self: TableInfo.TableInfo<Table_>["convexDocument"],
    table: Table_,
  ): Effect.Effect<
    TableInfo.TableInfo<Table_>["document"],
    DocumentDecodeError
  > =>
    pipe(
      self,
      Schema.decodeUnknownEffect(table.Doc),
      Effect.catchIf(Schema.isSchemaError, (schemaError) =>
        Effect.fail(
          new DocumentDecodeError({
            tableName: table.tableName,
            id: self._id,
            parseError: schemaError.message,
          }),
        ),
      ),
    ),
);

export const encode = Function.dual<
  <Table_ extends Table.AnyWithProps>(
    table: Table_,
  ) => (
    self: Schema.Schema.Type<Table.Fields<Table_>>,
  ) => Effect.Effect<
    Schema.Codec.Encoded<Table.Fields<Table_>>,
    DocumentEncodeError
  >,
  <Table_ extends Table.AnyWithProps>(
    self: Schema.Schema.Type<Table.Fields<Table_>>,
    table: Table_,
  ) => Effect.Effect<
    Schema.Codec.Encoded<Table.Fields<Table_>>,
    DocumentEncodeError
  >
>(
  2,
  <Table_ extends Table.AnyWithProps>(
    self: Schema.Schema.Type<Table.Fields<Table_>>,
    table: Table_,
  ): Effect.Effect<
    Schema.Codec.Encoded<Table.Fields<Table_>>,
    DocumentEncodeError
  > =>
    pipe(
      self,
      Schema.encodeEffect(table.Fields),
      Effect.catchIf(Schema.isSchemaError, (schemaError) =>
        Effect.fail(
          new DocumentEncodeError({
            tableName: table.tableName,
            id: self._id,
            parseError: schemaError.message,
          }),
        ),
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
